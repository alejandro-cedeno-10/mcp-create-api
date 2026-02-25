import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { createApiaryToolHandlers } from "./tools.js";

const server = new Server(
  { name: "apiary-context-server", version: "1.0.0" },
  {
    capabilities: {
      tools: {}
    }
  }
);

const handlers = createApiaryToolHandlers();

server.setRequestHandler(ListToolsRequestSchema, async (request) =>
  handlers.listTools(request)
);

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handlers.callTool(request)
);

const transport = new StdioServerTransport();

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
