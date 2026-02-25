/**
 * Handler for list_apiary_apis tool
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiaryToolClient } from "../types/index.js";
import { createErrorResult, createSuccessResult, buildErrorMessage } from "../utils/results.js";

/**
 * Handles the list_apiary_apis tool call
 */
export async function handleListApiaryApis(
  client: ApiaryToolClient
): Promise<CallToolResult> {
  try {
    const apis = await client.listApis();
    const text = apis.length > 0 ? apis.join("\n") : "No APIs available";
    return createSuccessResult(text);
  } catch (error) {
    const message = buildErrorMessage(error, "Apiary list command failed");
    return createErrorResult(message);
  }
}
