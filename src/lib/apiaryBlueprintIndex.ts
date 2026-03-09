/**
 * SQLite + FTS5 index for Apiary blueprints (RAG).
 * Blueprints are chunked and stored per api_name; search returns only relevant sections.
 * Optional embeddings (Xenova/all-MiniLM-L6-v2) enable hybrid BM25 + vector search.
 */

import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chunkBlueprint, type BlueprintSection } from "./blueprintChunker.js";
import {
  embed,
  cosineSimilarity,
  float32ToBuffer,
  bufferToFloat32,
} from "./embedder.js";

const CACHE_DIR = path.join(process.cwd(), ".apiary_cache");
const DB_PATH = path.join(CACHE_DIR, "blueprints.db");

/** RRF constant (Reciprocal Rank Fusion). */
const RRF_K = 60;

let _db: Database.Database | null = null;

async function ensureDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function openDb(): Promise<Database.Database> {
  if (_db) return _db;
  await ensureDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  initSchema(db);
  _db = db;
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apiary_blueprints (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      api_name   TEXT    UNIQUE NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apiary_blueprint_sections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      blueprint_id INTEGER NOT NULL REFERENCES apiary_blueprints(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL DEFAULT '',
      content     TEXT    NOT NULL,
      position    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bp_sections_blueprint ON apiary_blueprint_sections(blueprint_id);

    CREATE TABLE IF NOT EXISTS apiary_blueprint_sections_emb (
      section_id INTEGER PRIMARY KEY REFERENCES apiary_blueprint_sections(id) ON DELETE CASCADE,
      embedding  BLOB NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS apiary_blueprint_sections_fts USING fts5(
      title,
      content,
      content     = apiary_blueprint_sections,
      content_rowid = id
    );

    CREATE TRIGGER IF NOT EXISTS bp_sections_ai AFTER INSERT ON apiary_blueprint_sections BEGIN
      INSERT INTO apiary_blueprint_sections_fts(rowid, title, content)
      VALUES (new.id, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS bp_sections_ad AFTER DELETE ON apiary_blueprint_sections BEGIN
      INSERT INTO apiary_blueprint_sections_fts(apiary_blueprint_sections_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS bp_sections_au AFTER UPDATE ON apiary_blueprint_sections BEGIN
      INSERT INTO apiary_blueprint_sections_fts(apiary_blueprint_sections_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
      INSERT INTO apiary_blueprint_sections_fts(rowid, title, content)
      VALUES (new.id, new.title, new.content);
    END;
  `);
}

export interface SectionRow {
  id: number;
  blueprint_id: number;
  title: string;
  content: string;
  position: number;
}

/**
 * Computes embeddings for sections and stores them in apiary_blueprint_sections_emb.
 * Runs in background; failures are logged and skipped per section.
 */
async function embedSectionsInBackground(
  db: Database.Database,
  sectionRows: { id: number; title: string; content: string }[]
): Promise<void> {
  const insertEmb = db.prepare(
    "INSERT OR REPLACE INTO apiary_blueprint_sections_emb (section_id, embedding) VALUES (?, ?)"
  );
  for (const row of sectionRows) {
    try {
      const text = `${row.title}\n\n${row.content}`.slice(0, 8000);
      const vec = await embed(text);
      insertEmb.run(row.id, float32ToBuffer(vec));
    } catch (err) {
      console.warn("[apiary-mcp] embed section failed:", row.id, err);
    }
  }
}

/**
 * Ensures the blueprint for apiName is indexed. Call with the raw blueprint content
 * (from cache or fetch). Re-indexes if content is new (replaces existing sections).
 */
export async function ensureIndexed(apiName: string, rawBlueprint: string): Promise<void> {
  const db = await openDb();
  const normalized = apiName.trim().toLowerCase();

  const sections = chunkBlueprint(rawBlueprint);
  if (sections.length === 0) return;

  const insertBp = db.prepare(
    "INSERT INTO apiary_blueprints (api_name, fetched_at) VALUES (?, ?) ON CONFLICT(api_name) DO UPDATE SET fetched_at = excluded.fetched_at"
  );
  const getBpId = db.prepare("SELECT id FROM apiary_blueprints WHERE api_name = ?");
  const deleteSections = db.prepare("DELETE FROM apiary_blueprint_sections WHERE blueprint_id = ?");
  const insertSection = db.prepare(
    "INSERT INTO apiary_blueprint_sections (blueprint_id, title, content, position) VALUES (?, ?, ?, ?)"
  );

  db.transaction(() => {
    insertBp.run(normalized, Date.now());
    const row = getBpId.get(normalized) as { id: number };
    const blueprintId = row.id;
    deleteSections.run(blueprintId);
    sections.forEach((sec, i) => {
      insertSection.run(blueprintId, sec.title, sec.content, i);
    });
  })();

  // Background: compute and store embeddings for hybrid search (non-blocking)
  const sectionRows = db
    .prepare(
      "SELECT id, title, content FROM apiary_blueprint_sections WHERE blueprint_id = (SELECT id FROM apiary_blueprints WHERE api_name = ?) ORDER BY position"
    )
    .all(normalized) as { id: number; title: string; content: string }[];
  if (sectionRows.length > 0) {
    void embedSectionsInBackground(db, sectionRows);
  }
}

/**
 * Returns whether the blueprint for apiName is already indexed (has sections).
 */
export async function isIndexed(apiName: string): Promise<boolean> {
  const db = await openDb();
  const normalized = apiName.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT 1 FROM apiary_blueprint_sections s
       JOIN apiary_blueprints b ON b.id = s.blueprint_id
       WHERE b.api_name = ? LIMIT 1`
    )
    .get(normalized);
  return row !== undefined;
}

/**
 * FTS search across sections of a single blueprint. Returns top sections by BM25 rank.
 * When embeddings exist, uses hybrid BM25 + vector search with RRF.
 */
export async function searchSections(
  apiName: string,
  query: string,
  limit = 5
): Promise<SectionRow[]> {
  const db = await openDb();
  const normalized = apiName.trim().toLowerCase();

  const bp = db
    .prepare("SELECT id FROM apiary_blueprints WHERE api_name = ?")
    .get(normalized) as { id: number } | undefined;
  if (!bp) return [];

  const safeQuery = query.replace(/[^\w\s]/g, " ").trim();
  if (!safeQuery) {
    return db
      .prepare<[number, number], SectionRow>(
        "SELECT * FROM apiary_blueprint_sections WHERE blueprint_id = ? ORDER BY position LIMIT ?"
      )
      .all(bp.id, limit);
  }

  const hasEmbs = db
    .prepare(
      `SELECT 1 FROM apiary_blueprint_sections_emb e
       JOIN apiary_blueprint_sections s ON s.id = e.section_id
       WHERE s.blueprint_id = ? LIMIT 1`
    )
    .get(bp.id);

  if (!hasEmbs) {
    return searchSectionsBM25(db, bp.id, safeQuery, limit);
  }

  return searchSectionsHybrid(db, bp.id, safeQuery, limit);
}

function searchSectionsBM25(
  db: Database.Database,
  blueprintId: number,
  safeQuery: string,
  limit: number
): SectionRow[] {
  const rows = db
    .prepare<[string, number, number], SectionRow>(
      `SELECT s.*
       FROM apiary_blueprint_sections_fts f
       JOIN apiary_blueprint_sections s ON s.id = f.rowid
       WHERE f.apiary_blueprint_sections_fts MATCH ? AND s.blueprint_id = ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(safeQuery, blueprintId, limit);

  if (rows.length === 0) {
    return db
      .prepare<[number, number], SectionRow>(
        "SELECT * FROM apiary_blueprint_sections WHERE blueprint_id = ? ORDER BY position LIMIT ?"
      )
      .all(blueprintId, limit);
  }
  return rows;
}

async function searchSectionsHybrid(
  db: Database.Database,
  blueprintId: number,
  query: string,
  limit: number
): Promise<SectionRow[]> {
  const cap = Math.max(limit * 2, 20);

  const bm25Rows = db
    .prepare<[string, number, number], SectionRow>(
      `SELECT s.*
       FROM apiary_blueprint_sections_fts f
       JOIN apiary_blueprint_sections s ON s.id = f.rowid
       WHERE f.apiary_blueprint_sections_fts MATCH ? AND s.blueprint_id = ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(query.replace(/[^\w\s]/g, " ").trim(), blueprintId, cap);

  const embRows = db
    .prepare<
      [number],
      { section_id: number; embedding: Buffer }
    >(
      `SELECT e.section_id, e.embedding
       FROM apiary_blueprint_sections_emb e
       JOIN apiary_blueprint_sections s ON s.id = e.section_id
       WHERE s.blueprint_id = ?`
    )
    .all(blueprintId);

  if (embRows.length === 0) {
    return bm25Rows.length > 0 ? bm25Rows.slice(0, limit) : searchSectionsBM25(db, blueprintId, query, limit);
  }

  const queryVec = await embed(query);
  const vectorScores = embRows.map((r) => ({
    section_id: r.section_id,
    score: cosineSimilarity(queryVec, bufferToFloat32(r.embedding)),
  }));
  vectorScores.sort((a, b) => b.score - a.score);
  const vectorTop = vectorScores.slice(0, cap).map((x) => x.section_id);

  const bm25Rank = new Map<number, number>();
  bm25Rows.forEach((r, i) => bm25Rank.set(r.id, i + 1));
  const vectorRank = new Map<number, number>();
  vectorTop.forEach((id, i) => vectorRank.set(id, i + 1));

  const sectionIds = new Set([...bm25Rank.keys(), ...vectorRank.keys()]);
  const rrfScores = Array.from(sectionIds).map((id) => {
    const rrf =
      1 / (RRF_K + (bm25Rank.get(id) ?? cap + 1)) +
      1 / (RRF_K + (vectorRank.get(id) ?? cap + 1));
    return { id, rrf };
  });
  rrfScores.sort((a, b) => b.rrf - a.rrf);
  const topIds = rrfScores.slice(0, limit).map((x) => x.id);

  if (topIds.length === 0) {
    return db
      .prepare<[number, number], SectionRow>(
        "SELECT * FROM apiary_blueprint_sections WHERE blueprint_id = ? ORDER BY position LIMIT ?"
      )
      .all(blueprintId, limit);
  }

  const placeholders = topIds.map(() => "?").join(",");
  const ordered = db
    .prepare<number[], SectionRow>(
      `SELECT * FROM apiary_blueprint_sections WHERE id IN (${placeholders})`
    )
    .all(...topIds) as SectionRow[];

  const orderMap = new Map(ordered.map((r) => [r.id, r]));
  return topIds
    .map((id) => orderMap.get(id))
    .filter((r): r is SectionRow => r != null);
}

/**
 * Returns the first N sections (overview) when no query is provided.
 */
export async function getFirstSections(apiName: string, limit = 4): Promise<SectionRow[]> {
  const db = await openDb();
  const normalized = apiName.trim().toLowerCase();
  const bp = db
    .prepare("SELECT id FROM apiary_blueprints WHERE api_name = ?")
    .get(normalized) as { id: number } | undefined;
  if (!bp) return [];

  return db
    .prepare<[number, number], SectionRow>(
      "SELECT * FROM apiary_blueprint_sections WHERE blueprint_id = ? ORDER BY position LIMIT ?"
    )
    .all(bp.id, limit);
}
