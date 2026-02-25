import { constants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIRECTORY = path.join(process.cwd(), ".apiary_cache");
const TTL_24_HOURS_MS = 24 * 60 * 60 * 1000;

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

const resolveCachePath = (apiName: string): string => {
  const trimmed = apiName.trim();
  if (trimmed.length === 0) {
    throw new Error("apiName cannot be empty");
  }

  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (sanitized.length === 0) {
    throw new Error("apiName is not valid for caching");
  }

  const resolvedPath = path.resolve(CACHE_DIRECTORY, `${sanitized}.apib`);
  const relativePath = path.relative(CACHE_DIRECTORY, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("apiName resolves outside of cache directory");
  }

  return resolvedPath;
};

export class DocCache {
  public static getPath(apiName: string): string {
    return resolveCachePath(apiName);
  }

  public static async isExpired(apiName: string): Promise<boolean> {
    const filePath = DocCache.getPath(apiName);

    if (!(await fileExists(filePath))) {
      return true;
    }

    try {
      const { mtimeMs } = await stat(filePath);
      const age = Date.now() - mtimeMs;
      return age > TTL_24_HOURS_MS;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return true;
      }

      throw error;
    }
  }

  public static async get(apiName: string): Promise<string | null> {
    const filePath = DocCache.getPath(apiName);

    if (!(await fileExists(filePath))) {
      return null;
    }

    try {
      return await readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  public static async set(apiName: string, content: string): Promise<void> {
    await ensureCacheDirectory();
    const filePath = DocCache.getPath(apiName);
    await writeFile(filePath, content, "utf-8");
  }
}
