/**
 * Handler for alegra_list_submodules tool.
 *
 * Given a module name (e.g. "Ingresos"), returns the list of submodules
 * with their canonical URLs. Uses the same 5-day cached index as
 * alegra_list_modules — no extra network request unless cache is cold.
 *
 * Cascading pattern — Layer 2:
 *   After listing modules → call this to see what endpoints a module has
 *   → then use alegra_get_endpoint_docs for the full docs of one endpoint
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { alegraListSubmodulesSchema } from "../tools/schemas.js";
import { resolveAlegraIndex } from "./alegraListModulesHandler.js";
import { getOperations } from "../lib/alegraDatabase.js";
import type { AlegraModule } from "../lib/alegraDocsScraper.js";
import { createErrorResult, createSuccessResult } from "../utils/results.js";

export async function handleAlegraListSubmodules(
  rawArguments: unknown
): Promise<CallToolResult> {
  const parsed = alegraListSubmodulesSchema.safeParse(rawArguments ?? {});
  if (!parsed.success) {
    return createErrorResult(`Invalid arguments: ${parsed.error.message}`);
  }

  const { module: moduleName, forceRefresh } = parsed.data;

  try {
    const index = await resolveAlegraIndex(forceRefresh);

    const found = findModule(index.modules, moduleName);
    if (!found) {
      const available = index.modules.map((m) => `"${m.name}"`).join(", ");
      return createErrorResult(
        `Módulo "${moduleName}" no encontrado.\n` +
          `Módulos disponibles: ${available}\n` +
          `Usa alegra_list_modules para ver todos los módulos.`
      );
    }

    const text = await formatSubmoduleList(found, forceRefresh);
    return createSuccessResult(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult(
      `Error al obtener submodulos del módulo "${moduleName}": ${message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Module finder — fuzzy match on name or slug
// ---------------------------------------------------------------------------

function findModule(
  modules: AlegraModule[],
  query: string
): AlegraModule | undefined {
  const q = query.trim().toLowerCase();

  // Exact name match first
  const exactName = modules.find((m) => m.name.toLowerCase() === q);
  if (exactName) return exactName;

  // Slug match
  const slugMatch = modules.find((m) => m.slug === q.replace(/\s+/g, "-"));
  if (slugMatch) return slugMatch;

  // Partial name match
  const partial = modules.find((m) => m.name.toLowerCase().includes(q));
  if (partial) return partial;

  return undefined;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

async function formatSubmoduleList(mod: AlegraModule, refreshed: boolean): Promise<string> {
  const cacheNote = refreshed ? " (datos actualizados)" : "";

  const lines: string[] = [
    `# Módulo: ${mod.name}${cacheNote}`,
    "",
    `${mod.submodules.length} submodulo(s) disponibles:`,
    "",
  ];

  for (let i = 0; i < mod.submodules.length; i++) {
    const sub = mod.submodules[i];
    const ops = await getOperations(sub.slug);
    const opNote = ops.length > 0 ? ` _(${ops.length} operaciones indexadas)_` : "";

    lines.push(`${i + 1}. **${sub.name}**${opNote}`);
    lines.push(`   URL: ${sub.url}`);
    lines.push(`   Slug: \`${sub.slug}\``);

    if (ops.length > 0) {
      for (const op of ops) {
        lines.push(`   → ${op.name}`);
      }
    }

    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Para ver las operaciones de un submodulo: `alegra_get_endpoint_docs` con `module` + `submodule`.\n" +
      "Para la doc de una operación específica: agrega `operation=\"Crear\"` (o el nombre)."
  );

  return lines.join("\n");
}
