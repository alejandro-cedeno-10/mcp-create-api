import { describe, expect, it, beforeEach, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock
}));

vi.stubEnv("APIARY_CLI_PATH", "apiary");

import { ApiaryService, ApiaryError } from "../src/lib/apiary";

describe("ApiaryService", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("fetches blueprint content", async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (...args: unknown[]) => void) => {
      callback(null, "blueprint data", "");
      return {} as unknown as NodeJS.ChildProcess;
    });

    const result = await ApiaryService.fetchBlueprint("payments-v1");

    expect(result).toBe("blueprint data");
    expect(execFileMock).toHaveBeenCalledWith("apiary", ["fetch", "--api-name", "payments-v1"], expect.objectContaining({ encoding: "utf-8" }), expect.any(Function));
  });

  it("throws ApiaryError when CLI fails fetching blueprint", async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (...args: unknown[]) => void) => {
      callback(new Error("cli failed"), "", "fatal: not found");
      return {} as unknown as NodeJS.ChildProcess;
    });

    await expect(ApiaryService.fetchBlueprint("unknown"))
      .rejects.toThrow(ApiaryError);
  });

  it("lists available APIs", async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (...args: unknown[]) => void) => {
      callback(null, "payments-v1\ninvoices-v2\n", "");
      return {} as unknown as NodeJS.ChildProcess;
    });

    const apis = await ApiaryService.listApis();

    expect(apis).toEqual(["payments-v1", "invoices-v2"]);
  });

  it("returns empty list when CLI outputs nothing", async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (...args: unknown[]) => void) => {
      callback(null, "", "");
      return {} as unknown as NodeJS.ChildProcess;
    });

    const apis = await ApiaryService.listApis();

    expect(apis).toEqual([]);
  });

  it("throws ApiaryError when listing fails", async () => {
    execFileMock.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (...args: unknown[]) => void) => {
      callback(new Error("cli failed"), "", "stderr output");
      return {} as unknown as NodeJS.ChildProcess;
    });

    await expect(ApiaryService.listApis()).rejects.toThrow(ApiaryError);
  });
});
