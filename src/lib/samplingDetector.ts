/**
 * Sampling Capability Detector
 *
 * Detects if the MCP client supports sampling by attempting a test request.
 * This allows us to conditionally show/hide sampling-based tools.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

let samplingSupported: boolean | null = null;
let detectionPromise: Promise<boolean> | null = null;

/**
 * Detects if the MCP client supports sampling.
 *
 * Uses a lightweight test request. Result is cached for the session.
 *
 * @param server  MCP Server instance
 * @returns Promise resolving to true if sampling is supported, false otherwise
 */
export async function detectSamplingSupport(server: Server): Promise<boolean> {
  // Return cached result if already detected
  if (samplingSupported !== null) {
    return samplingSupported;
  }

  // Return existing promise if detection is in progress
  if (detectionPromise) {
    return detectionPromise;
  }

  // Start detection
  detectionPromise = (async () => {
    try {
      // Try a minimal sampling request
      await server.request(
        {
          method: "sampling/createMessage",
          params: {
            messages: [
              {
                role: "user",
                content: { type: "text", text: "test" },
              },
            ],
            maxTokens: 1,
          },
        },
        CreateMessageResultSchema
      );

      samplingSupported = true;
      return true;
    } catch (error) {
      // If sampling is not supported, the client will return an error
      // Common errors: "Method not found", "Capability not supported"
      samplingSupported = false;
      return false;
    } finally {
      // Clear promise after detection completes
      detectionPromise = null;
    }
  })();

  return detectionPromise;
}

/**
 * Resets the cached sampling support detection.
 * Useful for testing or if client capabilities change.
 */
export function resetSamplingDetection(): void {
  samplingSupported = null;
  detectionPromise = null;
}
