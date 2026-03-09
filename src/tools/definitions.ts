/**
 * Tool definitions for Apiary MCP Server
 * 
 * This file contains the MCP tool definitions that are exposed to clients.
 * Each tool includes bilingual descriptions (English + Spanish) and schema validation.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_NAMES } from "../config/constants.js";

/**
 * Tool: Get complete API Blueprint
 * 
 * Retrieves the full specification from Apiary.
 * ⚠️ Can be 50k+ tokens - use summary for overview.
 */
const getBlueprintTool: Tool = {
  name: TOOL_NAMES.GET_BLUEPRINT,
  description:
    "Retrieves, downloads, or updates the complete API Blueprint/Swagger/OpenAPI specification from Apiary. " +
    "Use this tool to: get full documentation, view complete spec, query all endpoints, update blueprint, " +
    "refresh documentation, download API spec, get latest version of the contract. " +
    "Supports local cache with 24h TTL and allows forcing updates with forceRefresh. " +
    "⚠️ Note: Full blueprints can be 50k+ tokens. Consider using get_apiary_blueprint_summary for overview. " +
    "Recupera, descarga, obtiene o actualiza la especificación API Blueprint/Swagger/OpenAPI completa desde Apiary. " +
    "Usa este tool para: obtener documentación completa, ver el spec, consultar endpoints, actualizar blueprint, " +
    "refrescar la documentación, descargar el API spec, obtener la última versión del contrato. " +
    "Soporta cache local con TTL de 24h y permite forzar actualización con forceRefresh. " +
    "⚠️ Nota: Blueprints completos pueden ser 50k+ tokens. Considera usar get_apiary_blueprint_summary para overview.",
  inputSchema: {
    type: "object",
    properties: {
      apiName: {
        type: "string",
        description:
          "Technical name of the API registered in Apiary (use subdomain from list) | " +
          "Nombre técnico del API registrado en Apiary (usa el subdomain de la lista)"
      },
      forceRefresh: {
        type: "boolean",
        description:
          "Force download ignoring local cache. Use true for: update, refresh, get again, forcefully, latest version | " +
          "Forzar descarga ignorando el cache local. Usa true para: actualizar, refrescar, obtener nuevamente, forzadamente, última versión"
      }
    },
    required: ["apiName"]
  }
};

/**
 * Tool: Get API Blueprint Summary (Token Optimized)
 * 
 * Gets a concise summary without downloading the full blueprint.
 * ⚡ 90% token reduction: ~1-5k tokens vs 50k+ for full blueprint.
 */
const getBlueprintSummaryTool: Tool = {
  name: TOOL_NAMES.GET_SUMMARY,
  description:
    "Gets a concise summary of an API without downloading the full blueprint. Returns only essential information. " +
    "Use this tool to: quickly check endpoints, see available models/schemas, get API overview, understand structure. " +
    "This is much faster and uses ~90% fewer tokens than get_apiary_blueprint. " +
    "Perfect for: initial exploration, checking what endpoints exist, understanding API structure. " +
    "⚡ Token efficient: ~1-5k tokens vs 50k+ for full blueprint. " +
    "Obtiene un resumen conciso de un API sin descargar el blueprint completo. Retorna solo información esencial. " +
    "Usa este tool para: verificar endpoints rápidamente, ver modelos/schemas disponibles, obtener overview del API, entender estructura. " +
    "Es mucho más rápido y usa ~90% menos tokens que get_apiary_blueprint. " +
    "Perfecto para: exploración inicial, verificar qué endpoints existen, entender estructura del API. " +
    "⚡ Optimizado en tokens: ~1-5k tokens vs 50k+ del blueprint completo.",
  inputSchema: {
    type: "object",
    properties: {
      apiName: {
        type: "string",
        description:
          "Technical name of the API registered in Apiary (use subdomain from list) | " +
          "Nombre técnico del API registrado en Apiary (usa el subdomain de la lista)"
      },
      includeExamples: {
        type: "boolean",
        description:
          "Include request/response examples in summary (adds more tokens) | " +
          "Incluir ejemplos de request/response en el resumen (agrega más tokens)",
        default: false
      }
    },
    required: ["apiName"]
  }
};

/**
 * Tool: Get blueprint overview from index (reuse chunked/embedded data)
 *
 * After you have brought the full blueprint (or used search), this returns a summary
 * built from the same indexed sections — so we embed and use what we previously brought.
 */
const getBlueprintOverviewTool: Tool = {
  name: TOOL_NAMES.GET_OVERVIEW,
  description:
    "Gets a summary of an API blueprint from the indexed sections (chunked and optionally embedded). " +
    "Use after get_apiary_blueprint or search_apiary_blueprint: reuses the same index, so you get an overview " +
    "without re-parsing the full spec. Saves tokens by returning only the first N sections up to maxTokens. " +
    "Use this to: get an overview when you already have the full blueprint cached/indexed, " +
    "see endpoints and schemas in order without fetching again. " +
    "Obtiene un resumen del blueprint desde las secciones indexadas (chunked y opcionalmente embebidas). " +
    "Usa después de get_apiary_blueprint o search_apiary_blueprint: reutiliza el mismo índice. " +
    "Resumen sin re-parsear el spec completo; control con maxSections y maxTokens.",
  inputSchema: {
    type: "object",
    properties: {
      apiName: {
        type: "string",
        description:
          "API name (subdomain from list_apiary_apis) | Nombre del API (subdomain de list_apiary_apis)"
      },
      maxSections: {
        type: "number",
        description:
          "Max sections to include (1–20, default 10) | Máximo de secciones (1–20, default 10)"
      },
      maxTokens: {
        type: "number",
        description:
          "Cap total response tokens (400–4000, default 2000) | Límite de tokens (400–4000, default 2000)"
      },
      forceRefresh: {
        type: "boolean",
        description:
          "Re-fetch blueprint and re-index | Re-fetch y re-indexar"
      },
    },
    required: ["apiName"],
  },
};

/**
 * Tool: List all available APIs
 * 
 * Lists all APIs in the Apiary account.
 */
const listApisTool: Tool = {
  name: TOOL_NAMES.LIST_APIS,
  description:
    "Lists, enumerates, or shows all available APIs in the Apiary account. " +
    "Use this tool to: see what APIs are available, list APIs, show available APIs, search API by name, " +
    "query API catalog, get complete listing of documented microservices. " +
    "Lista, enumera, muestra o busca todos los APIs disponibles en la cuenta de Apiary. " +
    "Usa este tool para: ver qué APIs hay, listar APIs, mostrar APIs disponibles, buscar un API por nombre, " +
    "consultar catálogo de APIs, obtener listado completo de microservicios documentados.",
  inputSchema: {
    type: "object"
  }
};

/**
 * Tool: Generate API integration code + unit tests
 *
 * Uses MCP sampling to request text generation from the client's own LLM.
 * No API key needed — the model is inherited from wherever this MCP server
 * is invoked (Cursor, OpenCode, Claude Desktop, etc.).
 *
 * Workflow:
 *   1. Fetch API blueprint from cache / Apiary
 *   2. sampling/createMessage → client's LLM generates code
 *   3. sampling/createMessage → client's LLM generates tests
 */
const generateApiIntegrationTool: Tool = {
  name: TOOL_NAMES.GENERATE_INTEGRATION,
  description:
    "Generates production-ready API integration code AND unit tests for a given Apiary API. " +
    "Uses MCP sampling so it inherits your IDE's LLM — no separate API key needed. " +
    "Use this tool to: scaffold integration code, generate a typed API client, create unit tests, " +
    "build an SDK stub, generate a starter for any programming language. " +
    "Supports any language (TypeScript, Python, Java, Go, C#, PHP, Ruby, Kotlin, etc.). " +
    "Auto-selects the test framework (Jest, pytest, JUnit, xUnit, testify…) unless you override it. " +
    "Returns a markdown guide with: installation steps + typed code + complete unit tests. " +
    "Genera código de integración listo para producción Y tests unitarios para un API de Apiary. " +
    "Usa MCP sampling para heredar el LLM de tu IDE — no necesita API key separada. " +
    "Usa este tool para: scaffoldear integración, generar cliente tipado, crear tests unitarios, " +
    "construir un stub de SDK, generar starter en cualquier lenguaje de programación. " +
    "Soporta cualquier lenguaje. Auto-detecta el framework de tests. " +
    "Retorna guía markdown con: instalación + código tipado + tests unitarios completos.",
  inputSchema: {
    type: "object",
    properties: {
      apiName: {
        type: "string",
        description:
          "Technical name of the API in Apiary (use subdomain from list_apiary_apis) | " +
          "Nombre técnico del API en Apiary (usa el subdomain de list_apiary_apis)",
      },
      language: {
        type: "string",
        description:
          "Target programming language. Examples: typescript, python, java, go, csharp, php, ruby, kotlin | " +
          "Lenguaje de programación destino. Ejemplos: typescript, python, java, go, csharp, php, ruby, kotlin",
      },
      useCase: {
        type: "string",
        description:
          "What you want to do with the API — be specific for better results. " +
          "Example: 'Authenticate with API key and create an invoice with line items' | " +
          "Qué quieres hacer con el API — sé específico para mejores resultados. " +
          "Ejemplo: 'Autenticarme con API key y crear una factura con líneas de detalle'",
      },
      testFramework: {
        type: "string",
        description:
          "Optional: override the test framework. Auto-detected from language if omitted. " +
          "Examples: Jest, pytest, JUnit 5, xUnit, testify, PHPUnit | " +
          "Opcional: sobreescribe el framework de tests. Se auto-detecta del lenguaje. " +
          "Ejemplos: Jest, pytest, JUnit 5, xUnit, testify, PHPUnit",
      },
    },
    required: ["apiName", "language", "useCase"],
  },
};

/**
 * Tool: Generate API integration plan (fallback when sampling not available)
 *
 * Returns a structured plan that the IDE's LLM can execute using MCP prompts.
 * This works in all MCP clients, even those without sampling support.
 *
 * The plan includes:
 *   1. Fetch blueprint (using get_apiary_blueprint tool)
 *   2. Generate code (using generate_integration_code prompt)
 *   3. Generate tests (using generate_integration_tests prompt)
 */
const generateApiIntegrationPlanTool: Tool = {
  name: TOOL_NAMES.GENERATE_INTEGRATION_PLAN,
  description:
    "Generates a structured plan for API integration code + unit tests. " +
    "Returns a JSON plan that your IDE's LLM can execute step-by-step using MCP prompts. " +
    "Use this when sampling is not available in your MCP client. " +
    "The plan includes: fetch blueprint → generate code → generate tests. " +
    "Works in all MCP clients (Cursor, OpenCode, Claude Desktop, etc.). " +
    "Genera un plan estructurado para código de integración + tests unitarios. " +
    "Retorna un plan JSON que el LLM de tu IDE puede ejecutar paso a paso usando prompts MCP. " +
    "Usa esto cuando sampling no está disponible en tu cliente MCP. " +
    "El plan incluye: obtener blueprint → generar código → generar tests. " +
    "Funciona en todos los clientes MCP.",
  inputSchema: {
    type: "object",
    properties: {
      apiName: {
        type: "string",
        description:
          "Technical name of the API in Apiary (use subdomain from list_apiary_apis) | " +
          "Nombre técnico del API en Apiary (usa el subdomain de list_apiary_apis)",
      },
      language: {
        type: "string",
        description:
          "Target programming language. Examples: typescript, python, java, go, csharp, php, ruby, kotlin | " +
          "Lenguaje de programación destino. Ejemplos: typescript, python, java, go, csharp, php, ruby, kotlin",
      },
      useCase: {
        type: "string",
        description:
          "What you want to do with the API — be specific for better results. " +
          "Example: 'Authenticate with API key and create an invoice with line items' | " +
          "Qué quieres hacer con el API — sé específico para mejores resultados. " +
          "Ejemplo: 'Autenticarme con API key y crear una factura con líneas de detalle'",
      },
      testFramework: {
        type: "string",
        description:
          "Optional: override the test framework. Auto-detected from language if omitted. " +
          "Examples: Jest, pytest, JUnit 5, xUnit, testify, PHPUnit | " +
          "Opcional: sobreescribe el framework de tests. Se auto-detecta del lenguaje. " +
          "Ejemplos: Jest, pytest, JUnit 5, xUnit, testify, PHPUnit",
      },
    },
    required: ["apiName", "language", "useCase"],
  },
};

// ---------------------------------------------------------------------------
// Apiary blueprint RAG — token-efficient search over CLI blueprint
// ---------------------------------------------------------------------------

const searchBlueprintTool: Tool = {
  name: TOOL_NAMES.SEARCH_BLUEPRINT,
  description:
    "Searches an Apiary API blueprint by keywords and returns only the most relevant sections (RAG). " +
    "Saves tokens: instead of loading the full 50k+ token blueprint, returns 3–5 chunked sections. " +
    "Use this to: find endpoints by method/path, find schemas, get auth or error docs. " +
    "If query is omitted, returns the first few sections (overview). " +
    "Blueprint is indexed on first use (structure-aware chunking + SQLite FTS5). " +
    "Busca en un blueprint de Apiary por palabras clave y devuelve solo las secciones relevantes (RAG). " +
    "Ahorra tokens: en lugar del blueprint completo devuelve 3–5 secciones. " +
    "Sin query devuelve las primeras secciones (overview).",
  inputSchema: {
    type: "object",
    properties: {
      apiName: { type: "string", description: "API name (subdomain from list_apiary_apis)" },
      query: { type: "string", description: "Optional keywords (e.g. 'POST invoice', 'schema', 'auth')" },
      maxSections: { type: "number", description: "Max sections to return (1–15, default 5)" },
      forceRefresh: { type: "boolean", description: "Re-fetch blueprint and re-index" },
    },
    required: ["apiName"],
  },
};

/**
 * Base tools (always available)
 */
const baseTools: Tool[] = [
  getBlueprintTool,
  getBlueprintSummaryTool,
  getBlueprintOverviewTool,
  searchBlueprintTool,
  listApisTool,
];

/**
 * Sampling-based tool (only shown if sampling is supported)
 */
const samplingTool: Tool = generateApiIntegrationTool;

/**
 * Prompt-based tool (always available, fallback for sampling)
 */
const promptBasedTool: Tool = generateApiIntegrationPlanTool;

/**
 * All available tools (base + prompt-based, sampling tool added conditionally)
 */
export const tools: Tool[] = [
  ...baseTools,
  promptBasedTool,
  samplingTool, // Will be filtered out if sampling not supported
];

/**
 * Tools that require sampling support
 */
export const SAMPLING_REQUIRED_TOOLS = new Set([TOOL_NAMES.GENERATE_INTEGRATION]);

/**
 * Tools that are fallbacks when sampling is NOT available
 */
export const PROMPT_BASED_TOOLS = new Set([TOOL_NAMES.GENERATE_INTEGRATION_PLAN]);

/**
 * Tool lookup by name for validation
 */
export const toolsByName = new Map(
  tools.map(tool => [tool.name, tool])
);
