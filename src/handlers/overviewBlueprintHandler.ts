/**
 * Handler for get_apiary_blueprint_overview tool.
 *
 * Returns a summary built from the indexed sections (chunked/embedded when the
 * blueprint was fetched or searched). Reuses the same index as search_apiary_blueprint
 * so we "embed and use what we previously brought" from the full blueprint.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiaryToolClient, DocCacheAdapter } from "../types/index.js";
import { overviewBlueprintArgumentsSchema } from "../tools/schemas.js";
import { createErrorResult, createSuccessResult, buildErrorMessage } from "../utils/results.js";
import { ensureIndexed, getFirstSections } from "../lib/apiaryBlueprintIndex.js";
import { estimateTokens, trimSectionsToTokenBudget } from "../lib/blueprintChunker.js";

function formatOverviewOutput(
  sections: Array<{ title: string; content: string }>,
  apiName: string
): string {
  const totalTokens = sections.reduce((acc, s) => acc + estimateTokens(s.title + s.content), 0);
  const header = [
    `# Resumen desde índice — \`${apiName}\``,
    "",
    "> Usa las secciones ya indexadas (chunked y opcionalmente embebidas) del blueprint completo.",
    "",
    `**Secciones:** ${sections.length} | **~${totalTokens} tokens**`,
    "",
    "---",
    "",
  ];
  const body = sections.map(
    (s) => (s.title ? `## ${s.title}\n\n${s.content}` : s.content)
  );
  return header.join("\n") + body.join("\n\n");
}

/**
 * Handles the get_apiary_blueprint_overview tool call.
 * Fetches/caches blueprint, ensures it is indexed, then returns the first N sections
 * (overview) trimmed to maxTokens — reusing the same chunked/embedded data.
 */
export async function handleGetBlueprintOverview(
  rawArguments: unknown,
  client: ApiaryToolClient,
  cache: DocCacheAdapter
): Promise<CallToolResult> {
  const parsed = overviewBlueprintArgumentsSchema.safeParse(rawArguments ?? {});
  if (!parsed.success) {
    return createErrorResult(`Invalid arguments: ${parsed.error.message}`);
  }

  const { apiName, maxSections, maxTokens, forceRefresh } = parsed.data;

  try {
    let blueprint = await cache.get(apiName);
    const expired = await cache.isExpired(apiName);

    if (!blueprint || expired || forceRefresh) {
      blueprint = await client.fetchBlueprint(apiName);
      await cache.set(apiName, blueprint);
    }

    await ensureIndexed(apiName, blueprint);

    const sections = await getFirstSections(apiName, maxSections);

    if (sections.length === 0) {
      return createSuccessResult(
        `No hay secciones indexadas para "${apiName}". El blueprint puede estar vacío o no ser parseable. Usa get_apiary_blueprint para traer el completo primero.`
      );
    }

    const budgeted = trimSectionsToTokenBudget(
      sections.map((s) => ({ title: s.title, content: s.content })),
      maxTokens
    );

    const text = formatOverviewOutput(budgeted, apiName);
    return createSuccessResult(text);
  } catch (error) {
    const message = buildErrorMessage(error, "get_apiary_blueprint_overview failed");
    return createErrorResult(message);
  }
}
