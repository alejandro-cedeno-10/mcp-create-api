/**
 * Tool handlers and routing for Apiary MCP Server
 * 
 * This module provides the MCP tool handlers following clean architecture principles.
 */

import type {
  CallToolRequest,
  CallToolResult,
  ListToolsRequest,
  ListToolsResult
} from "@modelcontextprotocol/sdk/types.js";

import { ApiaryService } from "./lib/apiary.js";
import { DocCache } from "./lib/cache.js";
import { tools, toolsByName } from "./tools/definitions.js";
import { TOOL_NAMES } from "./config/constants.js";
import { createErrorResult } from "./utils/results.js";

import {
  handleGetApiaryBlueprint,
  handleGetBlueprintSummary,
  handleListApiaryApis
} from "./handlers/index.js";

import type { ApiaryToolClient, DocCacheAdapter } from "./types/index.js";

/**
 * Creates the MCP tool handlers with dependency injection
 * 
 * @param client - Apiary service client (default: ApiaryService)
 * @param cache - Document cache adapter (default: DocCache)
 * @returns Tool handlers for MCP server
 */
export function createApiaryToolHandlers(
  client: ApiaryToolClient = ApiaryService,
  cache: DocCacheAdapter = DocCache
) {
  return {
    /**
     * Lists all available tools
     */
    listTools: async (_request: ListToolsRequest): Promise<ListToolsResult> => ({
      tools
    }),

    /**
     * Handles tool execution with routing
     */
    callTool: async (request: CallToolRequest): Promise<CallToolResult> => {
      const { name, arguments: rawArguments } = request.params;

      // Validate tool exists
      if (!toolsByName.has(name)) {
        return createErrorResult(`Tool ${name} is not registered`);
      }

      // Route to appropriate handler
      switch (name) {
        case TOOL_NAMES.GET_BLUEPRINT:
          return handleGetApiaryBlueprint(rawArguments, client, cache);

        case TOOL_NAMES.GET_SUMMARY:
          return handleGetBlueprintSummary(rawArguments, client, cache);

        case TOOL_NAMES.LIST_APIS:
          return handleListApiaryApis(client);

        default:
          // This should never happen due to validation above
          return createErrorResult(`Unhandled tool: ${name}`);
      }
    }
  };
}

/**
 * Type export for tool handlers
 */
export type ApiaryToolHandlers = ReturnType<typeof createApiaryToolHandlers>;
