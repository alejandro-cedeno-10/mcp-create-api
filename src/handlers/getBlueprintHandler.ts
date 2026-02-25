/**
 * Handler for get_apiary_blueprint tool
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiaryToolClient, DocCacheAdapter, RefreshOptions, RefreshReason } from "../types/index.js";
import { blueprintArgumentsSchema } from "../tools/schemas.js";
import { createErrorResult, formatBlueprintResponse, buildErrorMessage } from "../utils/results.js";

/**
 * Determines if blueprint should be refreshed
 */
function shouldRefreshBlueprint(options: RefreshOptions): boolean {
  const { forceRefresh, cachedDoc, expired } = options;
  const hasCache = cachedDoc !== null;
  return forceRefresh || expired || !hasCache;
}

/**
 * Computes the reason for refresh
 */
function computeRefreshReason(options: RefreshOptions): RefreshReason {
  const { forceRefresh, cachedDoc, expired } = options;

  if (forceRefresh) {
    return "Manual";
  }

  if (cachedDoc === null) {
    return "Nuevo";
  }

  return expired ? "TTL Expirado" : "Nuevo";
}

/**
 * Handles the get_apiary_blueprint tool call
 */
export async function handleGetApiaryBlueprint(
  rawArguments: unknown,
  client: ApiaryToolClient,
  cache: DocCacheAdapter
): Promise<CallToolResult> {
  const parsedArgs = blueprintArgumentsSchema.safeParse(rawArguments ?? {});
  if (!parsedArgs.success) {
    return createErrorResult(`Invalid arguments: ${parsedArgs.error.message}`);
  }

  const { apiName, forceRefresh } = parsedArgs.data;
  let cachedDoc: string | null = null;

  try {
    cachedDoc = await cache.get(apiName);
    const expired = await cache.isExpired(apiName);
    const needsRefresh = shouldRefreshBlueprint({ forceRefresh, cachedDoc, expired });

    if (!needsRefresh && cachedDoc) {
      return formatBlueprintResponse(
        "(Cache válido) Usando versión local de hace menos de 24h.",
        cachedDoc
      );
    }

    const reason = computeRefreshReason({ forceRefresh, cachedDoc, expired });
    const blueprint = await client.fetchBlueprint(apiName);
    await cache.set(apiName, blueprint);

    return formatBlueprintResponse(`(Actualizado - Razón: ${reason})`, blueprint);
  } catch (error) {
    if (cachedDoc) {
      return formatBlueprintResponse(
        "(Error de Red - Fallback a Cache Expirado)",
        cachedDoc
      );
    }

    const message = buildErrorMessage(error, "Apiary blueprint fetch failed");
    return createErrorResult(message);
  }
}
