import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { ApiaryError } from "../src/lib/apiary";
import {
  ApiaryToolHandlers,
  type DocCacheAdapter,
  createApiaryToolHandlers
} from "../src/tools";

const createCacheMock = () => {
  const mock = {
    isExpired: vi.fn<[string], Promise<boolean>>(),
    get: vi.fn<[string], Promise<string | null>>(),
    set: vi.fn<[string, string], Promise<void>>()
  } satisfies DocCacheAdapter & {
    isExpired: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  return mock;
};

describe("createApiaryToolHandlers", () => {
  const fetchBlueprint = vi.fn<[string], Promise<string>>();
  const listApis = vi.fn<[], Promise<string[]>>();

  let cache: ReturnType<typeof createCacheMock>;
  let handlers: ApiaryToolHandlers;

  beforeEach(() => {
    fetchBlueprint.mockReset();
    listApis.mockReset();
    cache = createCacheMock();
    cache.isExpired.mockResolvedValue(true);
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue();
    handlers = createApiaryToolHandlers({ fetchBlueprint, listApis }, cache);
  });

  it("returns tool definitions", async () => {
    const request = ListToolsRequestSchema.parse({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/list"
    });

    const response = await handlers.listTools(request);

    // No server passed → sampling tool (generate_api_integration) is hidden,
    // plan-based fallback (generate_api_integration_plan) is shown instead.
    const names = response.tools.map((tool) => tool.name);
    expect(names).toContain("get_apiary_blueprint");
    expect(names).toContain("get_apiary_blueprint_summary");
    expect(names).toContain("list_apiary_apis");
    expect(names).toContain("generate_api_integration_plan");
    expect(names).toContain("alegra_list_modules");
    expect(names).toContain("alegra_list_submodules");
    expect(names).toContain("alegra_get_endpoint_docs");
    expect(names).not.toContain("generate_api_integration"); // requires sampling
  });

  it("fetches blueprint and caches it when refresh is required", async () => {
    fetchBlueprint.mockResolvedValueOnce("blueprint");

    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "2",
      method: "tools/call",
      params: {
        name: "get_apiary_blueprint",
        arguments: {
          apiName: "payments-v1"
        }
      }
    });

    const result = await handlers.callTool(request);

    expect(fetchBlueprint).toHaveBeenCalledWith("payments-v1");
    expect(cache.set).toHaveBeenCalledWith("payments-v1", "blueprint");
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("Actualizado - Razón: Nuevo");
  });

  it("handles list_apiary_apis tool call", async () => {
    listApis.mockResolvedValueOnce(["payments-v1", "invoices-v2"]);

    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "3",
      method: "tools/call",
      params: {
        name: "list_apiary_apis"
      }
    });

    const result = await handlers.callTool(request);

    expect(listApis).toHaveBeenCalledTimes(1);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "payments-v1\ninvoices-v2"
      }
    ]);
  });

  it("surfaces stderr details when blueprint fetch fails without cache", async () => {
    fetchBlueprint.mockRejectedValueOnce(
      new ApiaryError("Apiary CLI failed", ["fetch"], "fatal: not found")
    );

    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "5",
      method: "tools/call",
      params: {
        name: "get_apiary_blueprint",
        arguments: {
          apiName: "missing-api"
        }
      }
    });

    const result = await handlers.callTool(request);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("fatal: not found");
  });

  it("returns error for unknown tool", async () => {
    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "4",
      method: "tools/call",
      params: {
        name: "unknown_tool"
      }
    });

    const result = await handlers.callTool(request);

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: "text",
      text: expect.stringContaining("not registered")
    });
  });

  it("returns validation error for missing apiName", async () => {
    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "9",
      method: "tools/call",
      params: {
        name: "get_apiary_blueprint",
        arguments: {}
      }
    });

    const result = await handlers.callTool(request);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invalid arguments");
  });

  it("uses cached blueprint when still within TTL", async () => {
    cache.get.mockResolvedValueOnce("cached-doc");
    cache.isExpired.mockResolvedValueOnce(false);

    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "6",
      method: "tools/call",
      params: {
        name: "get_apiary_blueprint",
        arguments: {
          apiName: "payments-v1"
        }
      }
    });

    const result = await handlers.callTool(request);

    expect(fetchBlueprint).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toContain("Cache válido");
    expect(result.content[0]?.text).toContain("cached-doc");
  });

  it("forces refresh when requested even if cache is fresh", async () => {
    fetchBlueprint.mockResolvedValueOnce("fresh-doc");
    cache.get.mockResolvedValueOnce("cached-doc");
    cache.isExpired.mockResolvedValueOnce(false);

    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "7",
      method: "tools/call",
      params: {
        name: "get_apiary_blueprint",
        arguments: {
          apiName: "payments-v1",
          forceRefresh: true
        }
      }
    });

    const result = await handlers.callTool(request);

    expect(fetchBlueprint).toHaveBeenCalledWith("payments-v1");
    expect(cache.set).toHaveBeenCalledWith("payments-v1", "fresh-doc");
    expect(result.content[0]?.text).toContain("Actualizado - Razón: Manual");
  });

  it("falls back to cached blueprint when refresh fails", async () => {
    fetchBlueprint.mockRejectedValueOnce(new Error("network down"));
    cache.get.mockResolvedValueOnce("stale-doc");
    cache.isExpired.mockResolvedValueOnce(true);

    const request = CallToolRequestSchema.parse({
      jsonrpc: "2.0",
      id: "8",
      method: "tools/call",
      params: {
        name: "get_apiary_blueprint",
        arguments: {
          apiName: "payments-v1"
        }
      }
    });

    const result = await handlers.callTool(request);

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("Fallback a Cache Expirado");
    expect(result.content[0]?.text).toContain("stale-doc");
  });
});
