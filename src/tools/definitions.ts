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
 * All available tools
 */
export const tools: Tool[] = [
  getBlueprintTool,
  getBlueprintSummaryTool,
  listApisTool
];

/**
 * Tool lookup by name for validation
 */
export const toolsByName = new Map(
  tools.map(tool => [tool.name, tool])
);
