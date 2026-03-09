/**
 * Handler for search_apiary_blueprint — RAG over Apiary CLI blueprint.
 * Indexes blueprint by sections (structure-aware chunking), returns only relevant chunks to save tokens.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiaryToolClient, DocCacheAdapter } from "../types/index.js";
import { searchBlueprintArgumentsSchema } from "../tools/schemas.js";
import { createErrorResult, createSuccessResult, buildErrorMessage } from "../utils/results.js";
import { ensureIndexed, searchSections, getFirstSections } from "../lib/apiaryBlueprintIndex.js";
import { estimateTokens, trimSectionsToTokenBudget } from "../lib/blueprintChunker.js";

function formatSectionsOutput(
  sections: Array<{ title: string; content: string }>,
  apiName: string,
  query?: string
): string {
  const queryNote = query ? ` | búsqueda: "${query}"` : " | primeras secciones";
  const totalTokens = sections.reduce((acc, s) => acc + estimateTokens(s.title + s.content), 0);
  const header = [
    `**API:** ${apiName}${queryNote}`,
    `**Secciones:** ${sections.length} | **~${totalTokens} tokens**`,
    "",
    "---",
  ];
  const body = sections.map(
    (s) => (s.title ? `\n## ${s.title}\n\n${s.content}` : s.content)
  );
  return [...header, ...body].join("\n");
}

export async function handleSearchApiaryBlueprint(
  rawArguments: unknown,
  client: ApiaryToolClient,
  cache: DocCacheAdapter
): Promise<CallToolResult> {
  const parsed = searchBlueprintArgumentsSchema.safeParse(rawArguments ?? {});
  if (!parsed.success) {
    return createErrorResult(`Invalid arguments: ${parsed.error.message}`);
  }

  const { apiName, query, maxSections, forceRefresh } = parsed.data;

  try {
    let blueprint = await cache.get(apiName);
    const expired = await cache.isExpired(apiName);

    if (!blueprint || expired || forceRefresh) {
      blueprint = await client.fetchBlueprint(apiName);
      await cache.set(apiName, blueprint);
    }

    await ensureIndexed(apiName, blueprint);

    const sections = query
      ? await searchSections(apiName, query, maxSections)
      : await getFirstSections(apiName, maxSections);

    if (sections.length === 0) {
      return createSuccessResult(
        `No hay secciones indexadas para "${apiName}". El blueprint puede estar vacío o no ser parseable.`
      );
    }

    // Token budget: cap sections so total ~tokens stays within limit (models read tokens)
    const budgeted = trimSectionsToTokenBudget(
      sections.map((s) => ({ title: s.title, content: s.content })),
      2000
    );

    const text = formatSectionsOutput(
      budgeted,
      apiName,
      query
    );

    return createSuccessResult(text);
  } catch (error) {
    const message = buildErrorMessage(error, "search_apiary_blueprint failed");
    return createErrorResult(message);
  }
}
