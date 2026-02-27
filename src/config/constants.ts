/**
 * Application constants and configuration
 */

/**
 * Cache configuration
 */
export const CACHE_CONFIG = {
  TTL_HOURS: 24,
  DIRECTORY: ".apiary_cache",
  FILE_EXTENSION: ".apib"
} as const;

/**
 * Apiary API configuration
 */
export const APIARY_CONFIG = {
  API_BASE_URL: "https://api.apiary.io",
  REST_ENDPOINT: "/me/apis",
  CLI_COMMAND: "apiary"
} as const;

/**
 * Token estimation configuration
 */
export const TOKEN_CONFIG = {
  CHARS_PER_TOKEN: 4,
  SUMMARY_TARGET_TOKENS: 3000,
  FULL_BLUEPRINT_AVG_TOKENS: 50000
} as const;

/**
 * Tool names (used for routing and validation)
 */
export const TOOL_NAMES = {
  GET_BLUEPRINT: "get_apiary_blueprint",
  GET_SUMMARY: "get_apiary_blueprint_summary",
  LIST_APIS: "list_apiary_apis",
  GENERATE_INTEGRATION: "generate_api_integration",
  GENERATE_INTEGRATION_PLAN: "generate_api_integration_plan",
  // Alegra public docs tools
  ALEGRA_LIST_MODULES: "alegra_list_modules",
  ALEGRA_LIST_SUBMODULES: "alegra_list_submodules",
  ALEGRA_GET_ENDPOINT_DOCS: "alegra_get_endpoint_docs",
} as const;

/**
 * Alegra public documentation configuration
 */
export const ALEGRA_DOCS_CONFIG = {
  BASE_URL: "https://developer.alegra.com",
  TTL_DAYS: 5,
  CACHE_DIRECTORY: ".alegra_cache",
} as const;

/**
 * Log prefixes for consistent logging
 */
export const LOG_PREFIX = "[Apiary MCP]" as const;
