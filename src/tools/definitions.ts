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
 * Tool: Generate API integration code + unit tests (LangGraph Agent)
 *
 * Internally runs a LangGraph ReAct agent that:
 *   1. Fetches the API blueprint (from cache or Apiary)
 *   2. Generates best-practice integration code in the requested language
 *   3. Generates unit tests using the appropriate framework
 *
 * The LLM used is resolved from LLM_PROVIDER env var — defaults to Anthropic
 * (same model Cursor uses), making it feel like the agent "inherits" the LLM.
 */
const generateApiIntegrationTool: Tool = {
  name: TOOL_NAMES.GENERATE_INTEGRATION,
  description:
    "Generates production-ready API integration code AND unit tests for a given Apiary API. " +
    "Internally uses a LangGraph agent to fetch the API spec, generate best-practice code, and write tests. " +
    "Use this tool to: scaffold integration code, generate a client for an API, create unit tests, " +
    "get a TypeScript/Python/Java/Go/C# client, generate integration starter, build an SDK stub. " +
    "Supports any language dynamically. Auto-selects the test framework (Jest, pytest, JUnit, etc.) " +
    "unless you specify one. The LLM inherits the same provider configured in the environment. " +
    "⚡ Returns: installation steps + typed integration code + unit tests in a single markdown guide. " +
    "Genera código de integración listo para producción Y tests unitarios para un API de Apiary. " +
    "Usa un agente LangGraph internamente para obtener el spec, generar código con buenas prácticas y escribir tests. " +
    "Usa este tool para: generar cliente de un API, scaffoldear integración, crear tests, " +
    "obtener un cliente TypeScript/Python/Java/Go/C#, generar starter de integración, construir un stub de SDK. " +
    "Soporta cualquier lenguaje dinámicamente. Auto-selecciona el framework de tests (Jest, pytest, JUnit, etc.) " +
    "a menos que especifiques uno. El LLM hereda el mismo provider configurado en el entorno. " +
    "⚡ Retorna: pasos de instalación + código de integración tipado + tests unitarios en una guía markdown.",
  inputSchema: {
    type: "object",
    properties: {
      apiName: {
        type: "string",
        description:
          "Technical name of the API registered in Apiary (use subdomain from list_apiary_apis) | " +
          "Nombre técnico del API registrado en Apiary (usa el subdomain de list_apiary_apis)"
      },
      language: {
        type: "string",
        description:
          "Programming language for the generated code. Examples: typescript, python, java, go, csharp, php, ruby, kotlin | " +
          "Lenguaje de programación para el código generado. Ejemplos: typescript, python, java, go, csharp, php, ruby, kotlin"
      },
      useCase: {
        type: "string",
        description:
          "Describe what you want to do with the API. Be specific for better results. " +
          "Example: 'Authenticate and create an invoice with line items, then retrieve its PDF' | " +
          "Describe qué quieres hacer con el API. Sé específico para mejores resultados. " +
          "Ejemplo: 'Autenticarme y crear una factura con líneas de detalle, luego obtener su PDF'"
      },
      testFramework: {
        type: "string",
        description:
          "Optional: override the test framework. Auto-detected from language if omitted. " +
          "Examples: Jest, pytest, JUnit 5, xUnit, testify, PHPUnit | " +
          "Opcional: sobreescribe el framework de tests. Se auto-detecta del lenguaje si se omite. " +
          "Ejemplos: Jest, pytest, JUnit 5, xUnit, testify, PHPUnit"
      }
    },
    required: ["apiName", "language", "useCase"]
  }
};

/**
 * All available tools
 */
export const tools: Tool[] = [
  getBlueprintTool,
  getBlueprintSummaryTool,
  listApisTool,
  generateApiIntegrationTool
];

/**
 * Tool lookup by name for validation
 */
export const toolsByName = new Map(
  tools.map(tool => [tool.name, tool])
);
