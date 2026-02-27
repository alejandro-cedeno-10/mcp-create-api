/**
 * Handler for alegra_get_endpoint_docs tool — 4-layer cascading fetch.
 *
 * ReadMe.io doc structure for Alegra API:
 *   Layer 1 → Modules       (Ingresos, Gastos…)
 *   Layer 2 → Submodules    (Facturas de proveedor, Pagos…)
 *   Layer 3 → Operations    (Crear, Listar, Editar, Eliminar…)  ← sidebar subpages
 *   Layer 4 → Sections/FTS  (chunked content stored in SQLite)
 *
 * Call patterns:
 *
 *   1. module + submodule  (no operation)
 *      → Fetch the submodule page, detect sidebar operations (rm-Sidebar-list)
 *      → If operations found: store them + return the operation list (guide to Layer 3)
 *      → If NO operations: treat page as a leaf, chunk + store + return sections
 *
 *   2. module + submodule + operation
 *      → Resolve the operation URL from DB (or discover first)
 *      → Fetch that operation page, chunk + store + return sections via FTS
 *
 *   3. Any call with query=
 *      → FTS5 search within the stored sections of the resolved page
 *
 * Token budget:
 *   Operation list    → ~200–400 tokens
 *   Sections (no FTS) → ~400–800 tokens (first 4 sections)
 *   Sections (FTS)    → ~200–500 tokens (top 3 sections)
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { alegraGetEndpointSchema } from "../tools/schemas.js";
import { resolveAlegraIndex } from "./alegraListModulesHandler.js";
import { AlegraDocsScraper } from "../lib/alegraDocsScraper.js";
import type { AlegraModule, AlegraSubmodule } from "../lib/alegraDocsScraper.js";
import {
  isPageExpired,
  storePage,
  storeOperations,
  getOperations,
  hasOperations,
  findOperation,
  searchSections,
  getAllSections,
  getPageMeta,
  isOperationPageExpired,
} from "../lib/alegraDatabase.js";
import { splitIntoSections, formatSections, estimateTokens } from "../lib/alegraChunker.js";
import { createErrorResult, createSuccessResult } from "../utils/results.js";

const DEFAULT_SECTION_LIMIT = 4;
const QUERY_SECTION_LIMIT = 3;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleAlegraGetEndpointDocs(
  rawArguments: unknown
): Promise<CallToolResult> {
  const parsed = alegraGetEndpointSchema.safeParse(rawArguments ?? {});
  if (!parsed.success) {
    return createErrorResult(`Invalid arguments: ${parsed.error.message}`);
  }

  const { module: moduleName, submodule: submoduleName, operation, query, forceRefresh } =
    parsed.data;

  try {
    const index = await resolveAlegraIndex(false);
    const resolution = resolveTarget(index.modules, moduleName, submoduleName);

    if (!resolution.found) {
      return createErrorResult(resolution.errorMessage);
    }

    const { submodule, mod } = resolution;

    // -----------------------------------------------------------------------
    // CASE A: operation specified → fetch that specific operation page
    // -----------------------------------------------------------------------
    if (operation) {
      return handleOperationPage(mod, submodule, operation, query, forceRefresh);
    }

    // -----------------------------------------------------------------------
    // CASE B: no operation → fetch submodule page, detect operations
    // -----------------------------------------------------------------------
    return handleSubmodulePage(mod, submodule, query, forceRefresh);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResult(
      `Error al obtener documentación de "${submoduleName}" › "${operation ?? ""}": ${message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Case B: submodule page — detect operations (sidebar), or return sections
// ---------------------------------------------------------------------------

async function handleSubmodulePage(
  mod: AlegraModule,
  submodule: AlegraSubmodule,
  query: string | undefined,
  forceRefresh: boolean
): Promise<CallToolResult> {
  const slug = submodule.slug;
  const expired = await isPageExpired(slug);
  const needsFetch = forceRefresh || expired;

  if (needsFetch) {
    const { content, operations } = await AlegraDocsScraper.fetchEndpointPage(submodule.url);
    const sections = splitIntoSections(content, submodule.name);
    await storePage(slug, mod.name, submodule.name, submodule.url, sections);

    if (operations.length > 0) {
      await storeOperations(slug, operations);
    }
  }

  // Check if this page has operations (either just discovered or from previous fetch)
  const ops = await getOperations(slug);

  if (ops.length > 0 && !query) {
    // This is a container page — guide the model to Layer 3
    return createSuccessResult(formatOperationList(mod, submodule, ops, needsFetch));
  }

  // Leaf page or FTS query over page sections
  return returnSections(slug, submodule.url, query, needsFetch, mod, submodule);
}

// ---------------------------------------------------------------------------
// Case A: specific operation page
// ---------------------------------------------------------------------------

async function handleOperationPage(
  mod: AlegraModule,
  submodule: AlegraSubmodule,
  operationName: string,
  query: string | undefined,
  forceRefresh: boolean
): Promise<CallToolResult> {
  const subSlug = submodule.slug;

  // Ensure the submodule is in the DB so we can look up operations.
  // forceRefresh must propagate here too — otherwise stale (wrong) operations
  // from a previous scrape will never be corrected until the TTL expires.
  if (forceRefresh || await isPageExpired(subSlug)) {
    const { content, operations } = await AlegraDocsScraper.fetchEndpointPage(submodule.url);
    const sections = splitIntoSections(content, submodule.name);
    await storePage(subSlug, mod.name, submodule.name, submodule.url, sections);
    if (operations.length > 0) await storeOperations(subSlug, operations);
  }

  // Find the requested operation
  const op = await findOperation(subSlug, operationName);

  if (!op) {
    const ops = await getOperations(subSlug);
    const available =
      ops.length > 0
        ? ops.map((o) => `"${o.name}"`).join(", ")
        : "No se encontraron operaciones en esta página.";

    return createErrorResult(
      `Operación "${operationName}" no encontrada en "${submodule.name}".\n` +
        `Operaciones disponibles: ${available}\n` +
        `Omite el parámetro 'operation' para ver la lista completa.`
    );
  }

  // Fetch + store the operation page (uses the operation slug as the page slug)
  const opSlug = op.slug;
  const opExpired = await isOperationPageExpired(opSlug);

  if (forceRefresh || opExpired) {
    const { content } = await AlegraDocsScraper.fetchOperationPage(op.url);
    const sections = splitIntoSections(content, op.name);
    await storePage(opSlug, mod.name, `${submodule.name} › ${op.name}`, op.url, sections);
  }

  return returnSections(
    opSlug,
    op.url,
    query,
    forceRefresh || opExpired,
    mod,
    { name: `${submodule.name} › ${op.name}`, url: op.url, slug: opSlug }
  );
}

// ---------------------------------------------------------------------------
// Section retrieval + formatting (shared by both cases)
// ---------------------------------------------------------------------------

async function returnSections(
  slug: string,
  pageUrl: string,
  query: string | undefined,
  refreshed: boolean,
  mod: AlegraModule,
  submodule: AlegraSubmodule
): Promise<CallToolResult> {
  const sections = query
    ? await searchSections(slug, query, QUERY_SECTION_LIMIT)
    : (await getAllSections(slug)).slice(0, DEFAULT_SECTION_LIMIT);

  if (sections.length === 0) {
    return createErrorResult(
      `No se encontró contenido para "${submodule.name}". ` +
        "Intenta con forceRefresh=true para re-indexar la página."
    );
  }

  const formatted = formatSections(
    sections.map((s) => ({ title: s.title, content: s.content })),
    pageUrl,
    query
  );

  const tokenEstimate = estimateTokens(formatted);
  const cacheNote = refreshed ? "(Re-indexado)" : "(Cache SQLite — TTL 5 días)";
  const meta = await getPageMeta(slug);
  const totalSections = (await getAllSections(slug)).length;

  const opHint = (await hasOperations(submodule.slug))
    ? `\n💡 Esta página tiene operaciones. Usa el param 'operation' para ver una específica.`
    : "";

  const header = [
    cacheNote,
    `Módulo: ${mod.name} › ${submodule.name}`,
    `Secciones mostradas: ${sections.length}/${totalSections} | Tokens aprox: ~${tokenEstimate}`,
    meta ? `Indexado: ${new Date(meta.fetched_at).toLocaleDateString("es")}` : "",
    query
      ? `Búsqueda FTS5: "${query}" → top ${sections.length} sección(es) [BM25]`
      : `Vista intro (${DEFAULT_SECTION_LIMIT} secciones). Usa 'query' para buscar dentro.`,
    opHint,
  ]
    .filter(Boolean)
    .join("\n");

  return createSuccessResult(`${header}\n\n${formatted}`);
}

// ---------------------------------------------------------------------------
// Operation list formatter
// ---------------------------------------------------------------------------

function formatOperationList(
  mod: AlegraModule,
  submodule: AlegraSubmodule,
  ops: Array<{ name: string; url: string; slug: string }>,
  refreshed: boolean
): string {
  const cacheNote = refreshed ? "(Re-indexado)" : "(Cache SQLite — TTL 5 días)";
  const lines: string[] = [
    cacheNote,
    `Módulo: ${mod.name} › ${submodule.name}`,
    ``,
    `Esta página es un contenedor con **${ops.length} operaciones** individuales:`,
    ``,
  ];

  ops.forEach((op, i) => {
    lines.push(`${i + 1}. **${op.name}**`);
    lines.push(`   URL: ${op.url}`);
    lines.push(`   Slug: \`${op.slug}\``);
    lines.push(``);
  });

  lines.push("---");
  lines.push(
    `Para ver la documentación completa de una operación, llama a \`alegra_get_endpoint_docs\` con:\n` +
      `  module="${mod.name}", submodule="${submodule.name}", operation="<nombre de la operación>"\n` +
      `  Ejemplo: operation="${ops[0]?.name ?? "Crear"}"`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

type ResolutionResult =
  | { found: true; submodule: AlegraSubmodule; mod: AlegraModule }
  | { found: false; errorMessage: string };

function resolveTarget(
  modules: AlegraModule[],
  moduleName: string,
  submoduleName: string
): ResolutionResult {
  const mod = findModule(modules, moduleName);

  if (!mod) {
    const available = modules.map((m) => `"${m.name}"`).join(", ");
    return {
      found: false,
      errorMessage:
        `Módulo "${moduleName}" no encontrado.\n` +
        `Módulos disponibles: ${available}\n` +
        `Usa alegra_list_modules para ver todos los módulos.`,
    };
  }

  const sub = findSubmodule(mod.submodules, submoduleName);

  if (!sub) {
    const available = mod.submodules.map((s) => `"${s.name}"`).join(", ");
    return {
      found: false,
      errorMessage:
        `Submodulo "${submoduleName}" no encontrado en módulo "${mod.name}".\n` +
        `Submodulos disponibles: ${available}\n` +
        `Usa alegra_list_submodules con module="${mod.name}" para ver todos.`,
    };
  }

  return { found: true, submodule: sub, mod };
}

function findModule(
  modules: AlegraModule[],
  query: string
): AlegraModule | undefined {
  const q = query.trim().toLowerCase();

  return (
    modules.find((m) => m.name.toLowerCase() === q) ??
    modules.find((m) => m.slug === q.replace(/\s+/g, "-")) ??
    modules.find((m) => m.name.toLowerCase().includes(q))
  );
}

function findSubmodule(
  submodules: AlegraSubmodule[],
  query: string
): AlegraSubmodule | undefined {
  const q = query.trim().toLowerCase();

  return (
    submodules.find((s) => s.name.toLowerCase() === q) ??
    submodules.find((s) => s.slug === q.replace(/\s+/g, "-")) ??
    submodules.find((s) => s.name.toLowerCase().includes(q)) ??
    submodules.find((s) => s.slug.includes(q.replace(/\s+/g, "-")))
  );
}
