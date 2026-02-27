import "dotenv/config";

import { warmUpEmbedder } from "./lib/alegraEmbedder.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createApiaryToolHandlers } from "./tools.js";
import { integrationPrompts } from "./prompts/integrationPrompts.js";

const server = new Server(
  { name: "apiary-context-server", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      sampling: {}, // Declared but may not be supported by client
      prompts: {}, // Prompts work in all MCP clients
    },
  }
);

const handlers = createApiaryToolHandlers(
  undefined,
  undefined,
  server
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async (request) =>
  handlers.listTools(request)
);

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handlers.callTool(request)
);

// Register prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: integrationPrompts,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const prompt = integrationPrompts.find((p) => p.name === request.params.name);
  if (!prompt) {
    throw new Error(`Prompt "${request.params.name}" not found`);
  }
  return { prompt };
});

const transport = new StdioServerTransport();

// Start loading the local embedding model in the background.
// By the time the user makes a real query, the model will likely be ready.
warmUpEmbedder();

try {
  await server.connect(transport);
  console.error("Apiary MCP Server running on stdio");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start Apiary MCP Server: ${message}`);
  process.exitCode = 1;
}

const shutdown = async () => {
  await transport.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
