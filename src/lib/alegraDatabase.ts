/**
 * SQLite database layer for Alegra public API docs.
 *
 * Why SQLite instead of MySQL/Postgres:
 *   - Zero server setup — the DB is a single file in .alegra_cache/
 *   - FTS5 (Full-Text Search) built in — same power as MySQL FULLTEXT
 *   - The MCP server runs as a stdio process, so an embedded DB is ideal
 *   - WAL mode makes reads and writes non-blocking
 *
 * Schema:
 *   alegra_pages    — one row per scraped endpoint page (metadata + TTL)
 *   alegra_sections — N rows per page, each is an H2/H3 section of the docs
 *   alegra_sections_fts — FTS5 virtual table for keyword search inside sections
 *
 * Token budget:
 *   Full page   → 1K–4K tokens
 *   3 FTS hits  → ~300–600 tokens  (what we return after this change)
 */

import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".alegra_cache");
const DB_PATH = path.join(CACHE_DIR, "docs.db");
const TTL_5_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageRow {
  id: number;
  slug: string;
  module: string;
  submodule: string;
  url: string;
  fetched_at: number;
}

export interface SectionRow {
  id: number;
  page_id: number;
  title: string;
  content: string;
  position: number;
}

export interface OperationRow {
  id: number;
  page_id: number;
  name: string;
  url: string;
  slug: string;
  position: number;
}

// ---------------------------------------------------------------------------
// Singleton DB
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

async function ensureDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function openDb(): Promise<Database.Database> {
  if (_db) return _db;

  await ensureDir();
  const db = new Database(DB_PATH);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  _db = db;
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alegra_pages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slug       TEXT    UNIQUE NOT NULL,
      module     TEXT    NOT NULL,
      submodule  TEXT    NOT NULL,
      url        TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alegra_sections (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id  INTEGER NOT NULL REFERENCES alegra_pages(id) ON DELETE CASCADE,
      title    TEXT    NOT NULL DEFAULT '',
      content  TEXT    NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sections_page ON alegra_sections(page_id);

    -- Level 4: individual HTTP operations within a submodule page
    -- e.g. "Crear factura de proveedor", "Listar facturas de proveedor"
    CREATE TABLE IF NOT EXISTS alegra_operations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id  INTEGER NOT NULL REFERENCES alegra_pages(id) ON DELETE CASCADE,
      name     TEXT    NOT NULL,
      url      TEXT    NOT NULL,
      slug     TEXT    NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_operations_page ON alegra_operations(page_id);

    -- Vector table: one float32 BLOB per section (384 dims, all-MiniLM-L6-v2)
    -- Cascades on section delete so it stays in sync automatically.
    CREATE TABLE IF NOT EXISTS alegra_sections_vec (
      section_id INTEGER PRIMARY KEY REFERENCES alegra_sections(id) ON DELETE CASCADE,
      embedding  BLOB NOT NULL
    );

    -- FTS5 virtual table: content= keeps only one copy of the text
    CREATE VIRTUAL TABLE IF NOT EXISTS alegra_sections_fts USING fts5(
      title,
      content,
      content     = alegra_sections,
      content_rowid = id
    );

    -- Keep FTS in sync via triggers
    CREATE TRIGGER IF NOT EXISTS sections_ai
      AFTER INSERT ON alegra_sections BEGIN
        INSERT INTO alegra_sections_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

    CREATE TRIGGER IF NOT EXISTS sections_ad
      AFTER DELETE ON alegra_sections BEGIN
        INSERT INTO alegra_sections_fts(alegra_sections_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
      END;

    CREATE TRIGGER IF NOT EXISTS sections_au
      AFTER UPDATE ON alegra_sections BEGIN
        INSERT INTO alegra_sections_fts(alegra_sections_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO alegra_sections_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;
  `);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when the cached page is absent or older than 5 days.
 */
export async function isPageExpired(slug: string): Promise<boolean> {
  const db = await openDb();
  const row = db
    .prepare<[string], Pick<PageRow, "fetched_at">>(
      "SELECT fetched_at FROM alegra_pages WHERE slug = ?"
    )
    .get(slug);

  if (!row) return true;
  return Date.now() - row.fetched_at > TTL_5_DAYS_MS;
}

/**
 * Checks whether a page exists in the DB regardless of TTL.
 */
export async function pageExists(slug: string): Promise<boolean> {
  const db = await openDb();
  const row = db
    .prepare<[string], { id: number }>(
      "SELECT id FROM alegra_pages WHERE slug = ?"
    )
    .get(slug);
  return row !== undefined;
}

/**
 * Deletes an existing page (cascades to sections + FTS).
 */
async function deletePage(slug: string): Promise<void> {
  const db = await openDb();
  db.prepare("DELETE FROM alegra_pages WHERE slug = ?").run(slug);
}

/**
 * Stores a page with its sections. Replaces any existing entry.
 */
export async function storePage(
  slug: string,
  module: string,
  submodule: string,
  url: string,
  sections: Array<{ title: string; content: string }>
): Promise<void> {
  const db = await openDb();

  // Delete old data first (cascade handles sections + FTS triggers)
  await deletePage(slug);

  const insertPage = db.prepare(
    "INSERT INTO alegra_pages (slug, module, submodule, url, fetched_at) VALUES (?, ?, ?, ?, ?)"
  );
  const insertSection = db.prepare(
    "INSERT INTO alegra_sections (page_id, title, content, position) VALUES (?, ?, ?, ?)"
  );

  // Run as a transaction for atomicity
  const tx = db.transaction(() => {
    const result = insertPage.run(slug, module, submodule, url, Date.now());
    const pageId = result.lastInsertRowid as number;

    sections.forEach((sec, i) => {
      insertSection.run(pageId, sec.title, sec.content, i);
    });
  });

  tx();
}

/**
 * Returns all sections for a page in order (no FTS — full content).
 */
export async function getAllSections(slug: string): Promise<SectionRow[]> {
  const db = await openDb();
  const page = db
    .prepare<[string], PageRow>("SELECT * FROM alegra_pages WHERE slug = ?")
    .get(slug);

  if (!page) return [];

  return db
    .prepare<[number], SectionRow>(
      "SELECT * FROM alegra_sections WHERE page_id = ? ORDER BY position"
    )
    .all(page.id);
}

/**
 * FTS search: returns the most relevant sections within a specific page.
 * Falls back to all sections when no query is provided.
 *
 * @param slug    - page slug to search within
 * @param query   - keyword(s) to search for
 * @param limit   - max sections to return (default 3)
 */
export async function searchSections(
  slug: string,
  query: string,
  limit = 3
): Promise<SectionRow[]> {
  const db = await openDb();

  const page = db
    .prepare<[string], PageRow>("SELECT * FROM alegra_pages WHERE slug = ?")
    .get(slug);

  if (!page) return [];

  // Sanitize query for FTS5 (avoid syntax errors with special chars)
  const safeQuery = query.replace(/[^\w\s]/g, " ").trim();

  if (!safeQuery) {
    return getAllSections(slug);
  }

  const rows = db
    .prepare<[string, number, number], SectionRow>(
      `SELECT s.*
       FROM alegra_sections_fts f
       JOIN alegra_sections s ON s.id = f.rowid
       WHERE f.alegra_sections_fts MATCH ?
         AND s.page_id = ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(safeQuery, page.id, limit);

  // If FTS returns nothing, fall back to first N sections
  if (rows.length === 0) {
    return db
      .prepare<[number, number], SectionRow>(
        "SELECT * FROM alegra_sections WHERE page_id = ? ORDER BY position LIMIT ?"
      )
      .all(page.id, limit);
  }

  return rows;
}

/**
 * Returns metadata for a stored page.
 */
export async function getPageMeta(slug: string): Promise<PageRow | null> {
  const db = await openDb();
  return (
    db
      .prepare<[string], PageRow>("SELECT * FROM alegra_pages WHERE slug = ?")
      .get(slug) ?? null
  );
}

// ---------------------------------------------------------------------------
// Operations (Level 4 — individual HTTP endpoints within a submodule)
// ---------------------------------------------------------------------------

/**
 * Stores the list of operations discovered in a submodule page's sidebar.
 * Replaces any previously stored operations for that page.
 */
export async function storeOperations(
  pageSlug: string,
  operations: Array<{ name: string; url: string; slug: string }>
): Promise<void> {
  if (operations.length === 0) return;

  const db = await openDb();
  const page = db
    .prepare<[string], PageRow>("SELECT * FROM alegra_pages WHERE slug = ?")
    .get(pageSlug);

  if (!page) return;

  const deleteOps = db.prepare(
    "DELETE FROM alegra_operations WHERE page_id = ?"
  );
  const insertOp = db.prepare(
    "INSERT INTO alegra_operations (page_id, name, url, slug, position) VALUES (?, ?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    deleteOps.run(page.id);
    operations.forEach((op, i) => {
      insertOp.run(page.id, op.name, op.url, op.slug, i);
    });
  });

  tx();
}

/**
 * Returns all operations for a submodule page, in order.
 */
export async function getOperations(pageSlug: string): Promise<OperationRow[]> {
  const db = await openDb();
  const page = db
    .prepare<[string], PageRow>("SELECT * FROM alegra_pages WHERE slug = ?")
    .get(pageSlug);

  if (!page) return [];

  return db
    .prepare<[number], OperationRow>(
      "SELECT * FROM alegra_operations WHERE page_id = ? ORDER BY position"
    )
    .all(page.id);
}

/**
 * Returns true if operations have been discovered and stored for this page.
 */
export async function hasOperations(pageSlug: string): Promise<boolean> {
  const db = await openDb();
  const page = db
    .prepare<[string], PageRow>("SELECT id FROM alegra_pages WHERE slug = ?")
    .get(pageSlug);

  if (!page) return false;

  const row = db
    .prepare<[number], { cnt: number }>(
      "SELECT COUNT(*) as cnt FROM alegra_operations WHERE page_id = ?"
    )
    .get(page.id);

  return (row?.cnt ?? 0) > 0;
}

/**
 * Finds a specific operation by name or slug within a submodule page.
 * Uses fuzzy matching (exact → slug → partial name).
 */
export async function findOperation(
  pageSlug: string,
  query: string
): Promise<OperationRow | null> {
  const ops = await getOperations(pageSlug);
  if (ops.length === 0) return null;

  const q = query.trim().toLowerCase();
  const qSlug = q.replace(/\s+/g, "-");

  return (
    ops.find((o) => o.name.toLowerCase() === q) ??
    ops.find((o) => o.slug === qSlug) ??
    ops.find((o) => o.name.toLowerCase().includes(q)) ??
    ops.find((o) => o.slug.includes(qSlug)) ??
    null
  );
}

/**
 * Checks whether a page exists for an operation slug (an operation URL stored
 * as a first-class page). This lets us cache operation pages the same way
 * we cache submodule pages — with sections + FTS.
 */
export async function isOperationPageExpired(operationSlug: string): Promise<boolean> {
  return isPageExpired(operationSlug);
}

// ---------------------------------------------------------------------------
// Semantic (vector) search — requires alegraEmbedder
// ---------------------------------------------------------------------------

/**
 * Generates embeddings for all sections of a page and stores them in
 * alegra_sections_vec. Safe to call multiple times (INSERT OR REPLACE).
 *
 * This is intentionally fire-and-forget in the handler: it runs after the
 * response is already being built, so it never delays the first reply.
 * Subsequent queries against the same page will benefit from hybrid search.
 */
export async function embedPageSections(slug: string): Promise<void> {
  const { embed } = await import("./alegraEmbedder.js");
  const db = await openDb();
  const sections = await getAllSections(slug);
  if (sections.length === 0) return;

  // Generate embeddings sequentially outside the transaction (async)
  const pairs: Array<[number, Buffer]> = [];
  for (const s of sections) {
    const vec = await embed(`${s.title}\n\n${s.content}`);
    pairs.push([s.id, Buffer.from(vec.buffer)]);
  }

  const upsert = db.prepare(
    "INSERT OR REPLACE INTO alegra_sections_vec (section_id, embedding) VALUES (?, ?)"
  );

  db.transaction(() => {
    for (const [id, blob] of pairs) {
      upsert.run(id, blob);
    }
  })();
}

/**
 * Hybrid search: BM25 (FTS5) + cosine similarity (all-MiniLM-L6-v2),
 * fused with Reciprocal Rank Fusion (RRF).
 *
 * Falls back to keyword-only search if the page has no stored embeddings yet
 * (e.g., right after a fresh scrape before embedPageSections completes).
 *
 * Why RRF works well here:
 *   - BM25 is precise on exact terminology ("GET /items", "campo 'name'")
 *   - Cosine catches synonym matches ("body parameters" ↔ "cuerpo de la solicitud")
 *   - RRF avoids score-space normalization issues by using rank positions only
 */
export async function hybridSearchSections(
  slug: string,
  query: string,
  limit = 3
): Promise<SectionRow[]> {
  const db = await openDb();
  const page = db
    .prepare<[string], PageRow>("SELECT * FROM alegra_pages WHERE slug = ?")
    .get(slug);
  if (!page) return [];

  // Check whether embeddings are available for this page
  const { cnt: vecCount } = db
    .prepare<[number], { cnt: number }>(
      `SELECT COUNT(*) as cnt
       FROM alegra_sections_vec v
       JOIN alegra_sections s ON s.id = v.section_id
       WHERE s.page_id = ?`
    )
    .get(page.id) ?? { cnt: 0 };

  if (vecCount === 0) {
    // Embeddings not ready yet — fall back to keyword-only
    return searchSections(slug, query, limit);
  }

  const CANDIDATE_K = 20;

  // --- 1. FTS5 keyword candidates ------------------------------------------
  const safeQuery = query.replace(/[^\w\s]/g, " ").trim();
  const ftsRows: Array<{ id: number }> = safeQuery
    ? (db
        .prepare(
          `SELECT s.id
           FROM alegra_sections_fts f
           JOIN alegra_sections s ON s.id = f.rowid
           WHERE f.alegra_sections_fts MATCH ?
             AND s.page_id = ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(safeQuery, page.id, CANDIDATE_K) as Array<{ id: number }>)
    : [];

  // --- 2. Vector similarity candidates -------------------------------------
  const { embed, cosineSimilarity, blobToFloat32 } = await import(
    "./alegraEmbedder.js"
  );

  const queryVec = await embed(query);

  const vecRows = db
    .prepare<[number], { id: number; embedding: Buffer }>(
      `SELECT s.id, v.embedding
       FROM alegra_sections s
       JOIN alegra_sections_vec v ON v.section_id = s.id
       WHERE s.page_id = ?`
    )
    .all(page.id) as Array<{ id: number; embedding: Buffer }>;

  const vecRanked = vecRows
    .map((r) => ({
      id: r.id,
      score: cosineSimilarity(queryVec, blobToFloat32(r.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_K);

  // --- 3. RRF fusion -------------------------------------------------------
  // k=60 is the standard RRF constant — balances precision and recall
  const K_RRF = 60;
  const scoreMap = new Map<number, number>();

  ftsRows.forEach(({ id }, rank) => {
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + 1 / (K_RRF + rank + 1));
  });

  vecRanked.forEach(({ id }, rank) => {
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + 1 / (K_RRF + rank + 1));
  });

  const topIds = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) {
    return (await getAllSections(slug)).slice(0, limit);
  }

  // Return sections ordered by their position in the page (more readable)
  return db
    .prepare<number[], SectionRow>(
      `SELECT * FROM alegra_sections
       WHERE id IN (${topIds.map(() => "?").join(",")})
       ORDER BY position`
    )
    .all(...topIds);
}
