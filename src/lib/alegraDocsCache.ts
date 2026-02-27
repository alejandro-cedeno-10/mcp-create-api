/**
 * Cache layer for Alegra public API docs (developer.alegra.com)
 *
 * - Index (module list + submodules): stored as JSON, TTL = 5 days
 * - Endpoint pages: stored as text/markdown, TTL = 5 days
 * - Separate directory: .alegra_cache/
 * - forceRefresh skips TTL check
 */

import { constants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIRECTORY = path.join(process.cwd(), ".alegra_cache");
const TTL_5_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const ensureCacheDirectory = async (): Promise<void> => {
  await mkdir(CACHE_DIRECTORY, { recursive: true });
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Converts a cache key to a safe filename.
 * Allowed characters: a-z A-Z 0-9 . _ -
 */
const resolveAlegraPath = (key: string, extension: string): string => {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new Error("Cache key cannot be empty");
  }

  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (sanitized.length === 0) {
    throw new Error("Cache key is not valid");
  }

  const resolvedPath = path.resolve(CACHE_DIRECTORY, `${sanitized}${extension}`);
  const relativePath = path.relative(CACHE_DIRECTORY, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Cache key resolves outside of cache directory");
  }

  return resolvedPath;
};

const isExpiredByPath = async (filePath: string): Promise<boolean> => {
  if (!(await fileExists(filePath))) return true;

  try {
    const { mtimeMs } = await stat(filePath);
    return Date.now() - mtimeMs > TTL_5_DAYS_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
};

/**
 * Cache adapter for the Alegra documentation index.
 * Stored as JSON under the key "index".
 */
export class AlegraIndexCache {
  private static readonly KEY = "alegra_docs_index";

  static getPath(): string {
    return resolveAlegraPath(this.KEY, ".json");
  }

  static async isExpired(): Promise<boolean> {
    return isExpiredByPath(this.getPath());
  }

  static async get(): Promise<string | null> {
    const filePath = this.getPath();
    if (!(await fileExists(filePath))) return null;

    try {
      return await readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  static async set(content: string): Promise<void> {
    await ensureCacheDirectory();
    await writeFile(this.getPath(), content, "utf-8");
  }
}

// Individual endpoint pages are now stored in SQLite via alegraDatabase.ts
// (chunked + FTS5 indexed). AlegraPageCache is no longer used.
