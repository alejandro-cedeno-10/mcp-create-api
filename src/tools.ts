/**
 * Tool handlers and routing for Apiary MCP Server
 *
 * This module provides the MCP tool handlers following clean architecture principles.
 * Tools are filtered dynamically based on client capabilities (sampling support).
 */

import type {
  CallToolRequest,
  CallToolResult,
  ListToolsRequest,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { ApiaryService } from "./lib/apiary.js";
import { DocCache } from "./lib/cache.js";
import {
  tools,
  SAMPLING_REQUIRED_TOOLS,
  PROMPT_BASED_TOOLS,
  toolsByName,
} from "./tools/definitions.js";
import { TOOL_NAMES } from "./config/constants.js";
import { createErrorResult } from "./utils/results.js";
import { detectSamplingSupport } from "./lib/samplingDetector.js";

import {
  handleGetApiaryBlueprint,
  handleGetBlueprintSummary,
  handleListApiaryApis,
  handleGenerateApiIntegration,
  handleGenerateIntegrationPlan,
} from "./handlers/index.js";

import type { ApiaryToolClient, DocCacheAdapter } from "./types/index.js";

/**
 * Creates the MCP tool handlers with dependency injection.
 *
 * @param client  Apiary service client (default: ApiaryService)
 * @param cache   Document cache adapter (default: DocCache)
 * @param server  MCP Server instance — required for sampling detection and sampling-based tools.
 */
export function createApiaryToolHandlers(
  client: ApiaryToolClient = ApiaryService,
  cache: DocCacheAdapter = DocCache,
  server?: Server
) {
  // Cache for sampling support detection
  let samplingSupported: boolean | null = null;
  let samplingCheckPromise: Promise<boolean> | null = null;

  /**
   * Gets the list of available tools, filtering based on client capabilities.
   *
   * - If sampling is available → show generate_api_integration, hide generate_api_integration_plan
   * - If sampling is NOT available → show generate_api_integration_plan, hide generate_api_integration
   */
  const getAvailableTools = async (): Promise<typeof tools> => {
    // If no server instance, hide sampling-based tools (show plan-based tool)
    if (!server) {
      return tools.filter(
        (tool) =>
          !SAMPLING_REQUIRED_TOOLS.has(tool.name as typeof TOOL_NAMES.GENERATE_INTEGRATION)
      );
    }

    // Check sampling support (cached)
    if (samplingSupported === null && !samplingCheckPromise) {
      samplingCheckPromise = detectSamplingSupport(server).then((supported) => {
        samplingSupported = supported;
        samplingCheckPromise = null;
        return supported;
      });
    }

    if (samplingCheckPromise) {
      await samplingCheckPromise;
    }

    // If sampling is NOT supported → hide sampling tool, show plan tool
    if (samplingSupported === false) {
      return tools.filter(
        (tool) =>
          !SAMPLING_REQUIRED_TOOLS.has(tool.name as typeof TOOL_NAMES.GENERATE_INTEGRATION)
      );
    }

    // If sampling IS supported → hide plan tool, show sampling tool
    if (samplingSupported === true) {
      return tools.filter(
        (tool) =>
          !PROMPT_BASED_TOOLS.has(tool.name as typeof TOOL_NAMES.GENERATE_INTEGRATION_PLAN)
      );
    }

    // Not yet checked → return all tools (will be filtered on next call)
    return tools;
  };

  return {
    /**
     * Lists all available tools, dynamically filtered based on client capabilities.
     */
    listTools: async (_request: ListToolsRequest): Promise<ListToolsResult> => {
      const availableTools = await getAvailableTools();
      return { tools: availableTools };
    },

    /**
     * Routes tool calls to the appropriate handler
     */
    callTool: async (request: CallToolRequest): Promise<CallToolResult> => {
      const { name, arguments: rawArguments } = request.params;

      if (!toolsByName.has(name)) {
        return createErrorResult(`Tool "${name}" is not registered`);
      }

      // Check if tool requires sampling and if it's supported
      if (SAMPLING_REQUIRED_TOOLS.has(name as typeof TOOL_NAMES.GENERATE_INTEGRATION)) {
        if (!server) {
          return createErrorResult(
            `Tool "${name}" requires sampling support. ` +
            `Use "${TOOL_NAMES.GENERATE_INTEGRATION_PLAN}" instead, which works with MCP prompts.`
          );
        }

        // Check sampling support
        if (samplingSupported === null && !samplingCheckPromise) {
          samplingCheckPromise = detectSamplingSupport(server).then((supported) => {
            samplingSupported = supported;
            samplingCheckPromise = null;
            return supported;
          });
        }

        if (samplingCheckPromise) {
          await samplingCheckPromise;
        }

        if (samplingSupported === false) {
          return createErrorResult(
            `Tool "${name}" requires sampling support, which is not available in your MCP client. ` +
            `Use "${TOOL_NAMES.GENERATE_INTEGRATION_PLAN}" instead, which works with MCP prompts.`
          );
        }
      }

      switch (name) {
        case TOOL_NAMES.GET_BLUEPRINT:
          return handleGetApiaryBlueprint(rawArguments, client, cache);

        case TOOL_NAMES.GET_SUMMARY:
          return handleGetBlueprintSummary(rawArguments, client, cache);

        case TOOL_NAMES.LIST_APIS:
          return handleListApiaryApis(client);

        case TOOL_NAMES.GENERATE_INTEGRATION:
          if (!server) {
            return createErrorResult(
              "generate_api_integration requires the MCP server instance (sampling). " +
              "Make sure it is passed to createApiaryToolHandlers()."
            );
          }
          return handleGenerateApiIntegration(rawArguments, server);

        case TOOL_NAMES.GENERATE_INTEGRATION_PLAN:
          return handleGenerateIntegrationPlan(rawArguments);

        default:
          return createErrorResult(`Unhandled tool: "${name}"`);
      }
    },
  };
}

export type ApiaryToolHandlers = ReturnType<typeof createApiaryToolHandlers>;
