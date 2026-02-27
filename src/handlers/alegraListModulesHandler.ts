/**
 * Handler for alegra_list_modules tool.
 *
 * Returns the top-level module list from developer.alegra.com.
 * Uses a 5-day cached index; forceRefresh bypasses TTL.
 *
 * Cascading pattern — Layer 1:
 *   User asks for Alegra docs → this tool lists modules
 *   → then use alegra_list_submodules to drill into a module
 *   → then use alegra_get_endpoint_docs to read a specific endpoint
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { alegraListModulesSchema } from "../tools/schemas.js";
import { AlegraIndexCache } from "../lib/alegraDocsCache.js";
import { AlegraDocsScraper, type AlegraDocsIndex } from "../lib/alegraDocsScraper.js";
import { createErrorResult, createSuccessResult } from "../utils/results.js";

// ---------------------------------------------------------------------------
// Shared cache helper — resolves (and optionally refreshes) the index
// ---------------------------------------------------------------------------

export async function resolveAlegraIndex(forceRefresh: boolean): Promise<AlegraDocsIndex> {
  const expired = await AlegraIndexCache.isExpired();

  if (!forceRefresh && !expired) {
    const cached = await AlegraIndexCache.get();
    if (cached) {
      return JSON.parse(cached) as AlegraDocsIndex;
    }
  }

  // Fetch fresh index
  const index = await AlegraDocsScraper.fetchIndex();
  await AlegraIndexCache.set(JSON.stringify(index, null, 2));
  return index;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAlegraListModules(
  rawArguments: unknown
): Promise<CallToolResult> {
  const parsed = alegraListModulesSchema.safeParse(rawArguments ?? {});
  if (!parsed.success) {
    return createErrorResult(`Invalid arguments: ${parsed.error.message}`);
  }

  const { forceRefresh } = parsed.data;

  try {
    const index = await resolveAlegraIndex(forceRefresh);
    const text = formatModuleList(index, forceRefresh);
    return createSuccessResult(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult(
      `Error al obtener módulos de Alegra API docs: ${message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

function formatModuleList(index: AlegraDocsIndex, refreshed: boolean): string {
  const cacheInfo = refreshed
    ? "(Actualizado desde developer.alegra.com)"
    : `(Cache válido — actualizado: ${new Date(index.fetchedAt).toLocaleDateString("es", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })})`;

  const lines: string[] = [
    `# Alegra API — Módulos disponibles ${cacheInfo}`,
    "",
    `Base URL: ${index.baseUrl}`,
    "",
    "## Módulos",
    "",
  ];

  for (const mod of index.modules) {
    lines.push(
      `- **${mod.name}** — ${mod.submodules.length} submodulo(s)`
    );
  }

  lines.push(
    "",
    "---",
    "Para ver los submodulos de un módulo usa: `alegra_list_submodules` con el nombre del módulo.",
    "Para obtener la doc completa de un endpoint usa: `alegra_get_endpoint_docs`."
  );

  return lines.join("\n");
}
