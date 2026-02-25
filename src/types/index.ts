/**
 * Type definitions for MCP tools and handlers
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Blueprint fetch arguments
 */
export interface BlueprintArguments {
  apiName: string;
  forceRefresh?: boolean;
}

/**
 * Blueprint summary arguments
 */
export interface BlueprintSummaryArguments {
  apiName: string;
  includeExamples?: boolean;
}

/**
 * API item from Apiary REST API
 */
export interface ApiaryApiItem {
  name: string;
  subdomain: string;
}

/**
 * Tool result builder type
 */
export type ToolResultBuilder = (message: string, data?: string) => CallToolResult;

/**
 * Error result builder type
 */
export type ErrorResultBuilder = (message: string) => CallToolResult;

/**
 * Apiary tool client interface
 */
export interface ApiaryToolClient {
  fetchBlueprint: (apiName: string) => Promise<string>;
  listApis: () => Promise<string[]>;
}

/**
 * Document cache adapter interface
 */
export interface DocCacheAdapter {
  isExpired(apiName: string): Promise<boolean>;
  get(apiName: string): Promise<string | null>;
  set(apiName: string, content: string): Promise<void>;
}

/**
 * Refresh decision options
 */
export interface RefreshOptions {
  forceRefresh: boolean;
  cachedDoc: string | null;
  expired: boolean;
}

/**
 * Refresh reason types
 */
export type RefreshReason = "Manual" | "TTL Expirado" | "Nuevo";
