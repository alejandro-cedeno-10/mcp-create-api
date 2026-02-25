/**
 * Utility functions for result and error handling
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiaryError } from "../lib/apiary.js";

/**
 * Creates an error result for tool calls
 */
export function createErrorResult(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

/**
 * Creates a success result for tool calls
 */
export function createSuccessResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

/**
 * Builds a descriptive error message from various error types
 */
export function buildErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiaryError) {
    const stderr = error.stderr?.trim();
    if (stderr && stderr.length > 0) {
      return `${error.message}\n${stderr}`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

/**
 * Formats a blueprint response with a status message
 */
export function formatBlueprintResponse(message: string, blueprint: string): CallToolResult {
  return createSuccessResult(`${message}\n${blueprint}`);
}
