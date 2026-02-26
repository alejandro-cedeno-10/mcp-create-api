/**
 * MCP Sampler — the MCP-native equivalent of LangChain's chain.invoke()
 *
 * Instead of calling an LLM API directly (which requires an API key),
 * sends a `sampling/createMessage` request back to the MCP client
 * (Cursor, OpenCode, Claude Desktop, etc.), which uses its own model.
 *
 * Flow:
 *   MCP Server ──sampling/createMessage──► Client (Cursor/OpenCode/…)
 *                                                  │
 *                                          Client's own LLM
 *                                                  │
 *   MCP Server ◄─────────────────── generated text
 *
 * The server never needs an API key — the host provides the model.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SamplerMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * All fields are optional and map 1:1 to MCP sampling params.
 *
 * includeContext:
 *   "none"       — no conversation history (default, safest for code gen)
 *   "thisServer" — includes context from conversations with this server
 *   "allServers" — includes context from all servers the client knows about
 *
 * temperature:
 *   0   = deterministic output (best for code generation)
 *   1   = creative/varied output
 *
 * intelligencePriority vs speedPriority:
 *   The client maps these to its available models.
 *   They are hints, not guarantees.
 */
export interface SamplerOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  includeContext?: "none" | "thisServer" | "allServers";
  intelligencePriority?: number;
  speedPriority?: number;
  costPriority?: number;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * JSON-RPC error code returned when the client does not implement
 * the `sampling/createMessage` method (e.g. Cursor, older clients).
 */
const JSONRPC_METHOD_NOT_FOUND = -32601;

/**
 * Requests a text completion from the MCP client's LLM.
 *
 * MCP-native equivalent of:
 *   const chain = prompt.pipe(llm).pipe(new StringOutputParser());
 *   return chain.invoke({ ... });
 *
 * @throws {SamplingNotSupportedError} If the client returns -32601 (Method not found)
 * @throws {Error} If the client returns a non-text response
 */

export async function requestCompletion(
  server: Server,
  messages: SamplerMessage[],
  options: SamplerOptions = {}
): Promise<string> {
  let result;

  try {
    result = await server.request(
      {
        method: "sampling/createMessage",
        params: {
          messages: messages.map(({ role, content }) => ({
            role,
            content: { type: "text", text: content },
          })),
          systemPrompt: options.systemPrompt,
          maxTokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0,
          includeContext: options.includeContext ?? "none",
          modelPreferences: {
            intelligencePriority: options.intelligencePriority ?? 0.8,
            speedPriority: options.speedPriority ?? 0.2,
            costPriority: options.costPriority ?? 0,
          },
        },
      },
      CreateMessageResultSchema
    );
  } catch (err) {
    const isSamplingUnsupported =
      isMcpError(err, JSONRPC_METHOD_NOT_FOUND) ||
      (err instanceof Error && err.message.includes("Method not found"));

    if (isSamplingUnsupported) {
      throw new SamplingNotSupportedError(
        "MCP sampling is not supported by your client. " +
        "Use generate_api_integration_plan instead, which works with MCP prompts."
      );
    }

    throw err;
  }

  if (result.content.type !== "text") {
    throw new Error(
      `MCP sampling returned unexpected content type: "${result.content.type}". Expected "text".`
    );
  }

  return result.content.text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether an unknown thrown value is an MCP/JSON-RPC error with
 * the given numeric error code.
 */
function isMcpError(err: unknown, code: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}

/**
 * Thrown when the connected MCP client does not implement sampling.
 * Caught by the integration handler to surface a clear user-facing message.
 */
export class SamplingNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SamplingNotSupportedError";
  }
}
