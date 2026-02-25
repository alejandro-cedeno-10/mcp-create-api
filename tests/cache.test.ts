import { afterEach, describe, expect, it } from "vitest";
import { rm, utimes } from "node:fs/promises";
import path from "node:path";

import { DocCache } from "../src/lib/cache";

const CACHE_DIRECTORY = path.join(process.cwd(), ".apiary_cache");

afterEach(async () => {
  await rm(CACHE_DIRECTORY, { recursive: true, force: true });
});

describe("DocCache", () => {
  it("sanitizes api names to stay inside cache directory", () => {
    const filePath = DocCache.getPath("billing/api:v1");

    expect(filePath.startsWith(CACHE_DIRECTORY)).toBe(true);
    expect(filePath.endsWith("billing_api_v1.apib")).toBe(true);
  });

  it("throws on empty api names", async () => {
    await expect(DocCache.get(" ")).rejects.toThrow();
  });

  it("marks fresh entries as not expired and old ones as expired", async () => {
    await DocCache.set("payments-v1", "doc");

    const fresh = await DocCache.isExpired("payments-v1");
    expect(fresh).toBe(false);

    const filePath = DocCache.getPath("payments-v1");
    const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(filePath, oldDate, oldDate);

    const expired = await DocCache.isExpired("payments-v1");
    expect(expired).toBe(true);
  });
});
