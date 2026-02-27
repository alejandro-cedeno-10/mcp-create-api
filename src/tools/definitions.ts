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
// Alegra public API documentation tools
// ---------------------------------------------------------------------------

/**
 * Tool: List Alegra API modules (Layer 1 of cascading docs fetch)
 */
const alegraListModulesTool: Tool = {
  name: TOOL_NAMES.ALEGRA_LIST_MODULES,
  description:
    "Lists all top-level modules available in the Alegra public API documentation (developer.alegra.com). " +
    "This is Layer 1 of the cascading docs pattern: list modules → list submodules → get endpoint details. " +
    "Use this tool to: see what sections the Alegra API docs have, get an overview of available API categories, " +
    "discover modules like Ingresos, Gastos, Inventario, Contactos, Bancos, etc. " +
    "Results are cached for 5 days. Use forceRefresh=true to get the latest version. " +
    "Lista todos los módulos principales de la documentación pública de Alegra API (developer.alegra.com). " +
    "Este es el Nivel 1 del patrón cascada: listar módulos → listar submodulos → obtener detalles del endpoint. " +
    "Úsalo para: ver qué secciones tiene la API de Alegra, descubrir módulos como Ingresos, Gastos, Inventario, etc. " +
    "El resultado se cachea por 5 días. Usa forceRefresh=true para obtener la versión más reciente.",
  inputSchema: {
    type: "object",
    properties: {
      forceRefresh: {
        type: "boolean",
        description:
          "Force re-fetch from developer.alegra.com, ignoring the 5-day cache. " +
          "Use true when the user mentions: force, latest, refresh, más reciente, forzar, actualizar. | " +
          "Forzar recarga desde developer.alegra.com ignorando el cache de 5 días.",
      },
    },
  },
};

/**
 * Tool: List submodules of an Alegra API module (Layer 2)
 */
const alegraListSubmodulesTool: Tool = {
  name: TOOL_NAMES.ALEGRA_LIST_SUBMODULES,
  description:
    "Lists all submodules (individual endpoint pages) within a specific Alegra API module. " +
    "This is Layer 2 of the cascading docs pattern: after listing modules, call this to see " +
    "what endpoints/pages a module contains, along with their URLs. " +
    "Use this tool to: drill into a specific module (e.g. 'Ingresos'), see its endpoints list, " +
    "discover URLs for Facturas de venta, Pagos, Notas Crédito, etc. " +
    "Module name is fuzzy-matched (e.g. 'ingresos', 'Ingresos', 'INGRESOS' all work). " +
    "Lista todos los submodulos (páginas de endpoints) de un módulo específico de Alegra API. " +
    "Este es el Nivel 2 del patrón cascada: después de listar módulos, usa esto para ver " +
    "qué endpoints contiene un módulo con sus URLs. " +
    "El nombre del módulo acepta coincidencia flexible (ej: 'ingresos', 'Ingresos' funcionan igual).",
  inputSchema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        description:
          "Name of the Alegra API module to list submodules for. " +
          "Examples: 'Ingresos', 'Gastos', 'Inventario', 'Contactos', 'Bancos', 'Configuraciones'. " +
          "Fuzzy-matched — partial names work. | " +
          "Nombre del módulo de Alegra API. Ejemplos: 'Ingresos', 'Gastos', 'Inventario'. " +
          "Acepta coincidencia parcial.",
      },
      forceRefresh: {
        type: "boolean",
        description:
          "Force re-fetch of the documentation index. | Forzar recarga del índice.",
      },
    },
    required: ["module"],
  },
};

/**
 * Tool: Get Alegra API docs — 4-layer cascading fetch with SQLite + FTS5
 *
 * Real ReadMe.io doc structure for Alegra API:
 *   Module → Submodule (container page) → Operation (individual endpoint) → Sections
 *
 * Smart auto-routing:
 *   - module + submodule only        → fetches submodule page, detects sidebar operations
 *                                      (rm-Sidebar-list / subpages CSS class)
 *                                      If operations exist → returns operation list
 *                                      If leaf page       → returns chunked sections
 *   - module + submodule + operation → fetches that specific operation page (GET/POST/PUT/DELETE)
 *   - any call with query            → SQLite FTS5 search within stored sections
 */
const alegraGetEndpointDocsTool: Tool = {
  name: TOOL_NAMES.ALEGRA_GET_ENDPOINT_DOCS,
  description:
    "Fetches Alegra API documentation with 4-layer cascading: Module → Submodule → Operation → Sections. " +
    "Content is stored in local SQLite (.alegra_cache/docs.db), chunked by H2/H3 sections. " +
    "Returns ONLY the most relevant sections, NOT the full page, to minimise token usage. " +
    "SMART AUTO-ROUTING: " +
    "  (1) module + submodule → detects sidebar operations (rm-Sidebar-list) automatically. " +
    "      If the page has sub-operations (Crear, Listar, Editar, etc.) → returns operation list. " +
    "      If it's a leaf page → returns first 4 sections (~400–800 tokens). " +
    "  (2) module + submodule + operation → fetches that specific HTTP endpoint page. " +
    "      Example: operation='Crear factura de proveedor' → GET/POST details, params, body, response. " +
    "  (3) Add query= for FTS5 keyword search within sections (top 3 results, ~200–500 tokens). " +
    "⚠️ Only call this when you know the module AND submodule. Use alegra_list_modules first if unsure. " +
    "Pages indexed for 5 days. forceRefresh=true to re-index. " +
    "Obtiene documentación de Alegra API con cascada de 4 niveles: Módulo → Submodulo → Operación → Secciones. " +
    "Almacenado en SQLite local (.alegra_cache/docs.db), dividido en secciones por H2/H3. " +
    "ENRUTAMIENTO AUTOMÁTICO: " +
    "  (1) module + submodule → detecta operaciones del sidebar (rm-Sidebar-list) automáticamente. " +
    "      Si la página tiene operaciones (Crear, Listar, etc.) → devuelve lista de operaciones. " +
    "      Si es página hoja → devuelve primeras 4 secciones. " +
    "  (2) module + submodule + operation → página del endpoint HTTP específico con params y ejemplos. " +
    "  (3) Agrega query= para búsqueda FTS5 dentro de las secciones (top 3, ~200–500 tokens). " +
    "⚠️ Úsalo solo cuando sepas módulo Y submodulo. Las páginas se indexan 5 días.",
  inputSchema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        description:
          "Name of the Alegra API module. Examples: 'Ingresos', 'Gastos', 'Inventario'. " +
          "Fuzzy-matched. | Nombre del módulo. Acepta coincidencia parcial.",
      },
      submodule: {
        type: "string",
        description:
          "Name of the submodule/section page. " +
          "Examples: 'Facturas de proveedor', 'Facturas de venta', 'Pagos', 'Ítems'. " +
          "Fuzzy-matched — partial names work. | " +
          "Nombre del submodulo. Ejemplos: 'Facturas de proveedor', 'Pagos', 'Ítems'. " +
          "Acepta coincidencia parcial.",
      },
      operation: {
        type: "string",
        description:
          "Optional: specific operation within the submodule (Level 4). " +
          "These are the links in the ReadMe.io left sidebar (rm-Sidebar-list / subpages class). " +
          "Examples: 'Crear factura de proveedor', 'Listar facturas', 'Obtener factura', 'Eliminar'. " +
          "First call WITHOUT operation to discover available operations. " +
          "Then call WITH operation to get the specific HTTP endpoint docs. " +
          "Fuzzy-matched — partial names work. | " +
          "Operación específica dentro del submodulo (los links del sidebar de ReadMe.io). " +
          "Ejemplos: 'Crear factura de proveedor', 'Listar', 'Obtener', 'Editar', 'Eliminar'. " +
          "Primera llamada SIN operation para descubrir operaciones disponibles, " +
          "luego CON operation para obtener el endpoint HTTP específico.",
      },
      query: {
        type: "string",
        description:
          "Optional FTS5 keyword search within the page sections (SQLite full-text search). " +
          "Returns top 3 most relevant sections (~200–500 tokens). " +
          "Examples: 'response', 'parámetros', 'body', 'ejemplo', 'error', 'autenticación'. " +
          "Omit to get the first 4 sections (overview). | " +
          "Búsqueda FTS5 dentro de secciones. Ejemplos: 'response', 'parámetros', 'error'.",
      },
      forceRefresh: {
        type: "boolean",
        description:
          "Force re-fetch and re-index, bypassing 5-day cache. " +
          "Use when user says: force, latest, refresh, más reciente, forzar, actualizar. | " +
          "Forzar recarga ignorando cache de 5 días.",
      },
    },
    required: ["module", "submodule"],
  },
};

/**
 * Base tools (always available)
 */
const baseTools: Tool[] = [
  getBlueprintTool,
  getBlueprintSummaryTool,
  listApisTool,
  alegraListModulesTool,
  alegraListSubmodulesTool,
  alegraGetEndpointDocsTool,
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
