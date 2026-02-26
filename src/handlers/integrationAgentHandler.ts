/**
 * Handler for generate_api_integration tool
 *
 * Orchestrates the integration agent and formats the result
 * as a developer-friendly markdown guide.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { integrationArgumentsSchema } from "../tools/schemas.js";
import { createErrorResult, createSuccessResult, buildErrorMessage } from "../utils/results.js";
import { runIntegrationAgent } from "../lib/integrationAgent.js";
import type { IntegrationAgentResult } from "../lib/integrationAgent.js";
import { SamplingNotSupportedError } from "../lib/sampler.js";
import { handleGenerateIntegrationPlan } from "./integrationPlanHandler.js";
import { executeIntegrationPlan } from "../lib/planExecutor.js";

// ---------------------------------------------------------------------------
// Install command hints per language
// ---------------------------------------------------------------------------

const INSTALL_HINTS: Record<string, string> = {
  typescript: "npm install axios\n# or: yarn add axios",
  javascript: "npm install axios",
  python: "pip install httpx\n# or: pip install requests",
  java: "<!-- Maven -->\n<dependency>\n  <groupId>com.squareup.okhttp3</groupId>\n  <artifactId>okhttp</artifactId>\n  <version>4.12.0</version>\n</dependency>",
  kotlin: "implementation(\"com.squareup.okhttp3:okhttp:4.12.0\")",
  csharp: "dotnet add package System.Net.Http",
  go: "# No install needed — uses net/http from stdlib\ngo mod tidy",
  php: "composer require guzzlehttp/guzzle",
  ruby: "gem install httparty",
  rust: "# Cargo.toml\n[dependencies]\nreqwest = { version = \"0.12\", features = [\"json\"] }\ntokio = { version = \"1\", features = [\"full\"] }",
};

function getInstallHint(language: string): string {
  return INSTALL_HINTS[language] ?? `# Install your preferred HTTP client for ${language}`;
}

// ---------------------------------------------------------------------------
// Response formatter
// ---------------------------------------------------------------------------

function formatIntegrationGuide(
  result: IntegrationAgentResult,
  viaSampling: boolean = true
): string {
  const { apiName, language, testFramework, code, tests } = result;
  const langLabel = language.charAt(0).toUpperCase() + language.slice(1);

  const methodNote = viaSampling
    ? "Generated via **MCP sampling** — model provided by your IDE."
    : "Generated via **MCP prompts** — your IDE's LLM executed the plan step-by-step.";

  const lines = [
    `# Integration Guide — \`${apiName}\` (${langLabel})`,
    "",
    `> ${methodNote}`,
    `> Test framework: **${testFramework}**`,
    "",
    "---",
    "",
    "## 1. Prerequisites",
    "",
    "```bash",
    getInstallHint(language),
    "```",
    "",
    "---",
    "",
    `## 2. Integration Code (${langLabel})`,
    "",
    `\`\`\`${language}`,
    code.trim(),
    "```",
    "",
    "---",
    "",
    `## 3. Unit Tests (${testFramework})`,
    "",
    `\`\`\`${language}`,
    tests.trim(),
    "```",
    "",
    "---",
    "",
    "## 4. Next Steps",
    "",
    `- [ ] Configure environment variables: \`API_BASE_URL\`, \`API_KEY\``,
    `- [ ] Run the tests and adjust mocks to match your project structure`,
    `- [ ] For the full API spec: \`get_apiary_blueprint("${apiName}")\``,
    `- [ ] For a quick overview: \`get_apiary_blueprint_summary("${apiName}")\``,
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handles the generate_api_integration tool call.
 *
 * @param rawArguments  Unvalidated tool arguments from the MCP client
 * @param server        MCP Server instance — used to send sampling requests
 *                      back to the client's LLM (no API key needed)
 */
export async function handleGenerateApiIntegration(
  rawArguments: unknown,
  server: Server
): Promise<CallToolResult> {
  const parsedArgs = integrationArgumentsSchema.safeParse(rawArguments ?? {});
  if (!parsedArgs.success) {
    return createErrorResult(`Invalid arguments: ${parsedArgs.error.message}`);
  }

  const { apiName, language, useCase, testFramework } = parsedArgs.data;

  try {
    // Try sampling-based workflow first
    const result = await runIntegrationAgent(server, {
      apiName,
      language,
      useCase,
      testFramework,
    });

    return createSuccessResult(formatIntegrationGuide(result, true));
  } catch (error) {
    // If sampling is not supported, try executing the plan using sampling
    // (plan executor uses the same sampling mechanism, so if it fails here,
    // it will fail in the executor too, and we'll fallback to returning the plan JSON)
    if (error instanceof SamplingNotSupportedError) {
      try {
        // Try to execute the plan using sampling (may still fail if sampling truly unavailable)
        const planResult = await executeIntegrationPlan(server, {
          apiName,
          language,
          useCase,
          testFramework,
        });

        // Success! Plan executed via sampling, return the generated code + tests
        return createSuccessResult(formatIntegrationGuide(planResult, false));
      } catch (planError) {
        // If plan execution also fails (sampling truly unavailable),
        // return the plan JSON so the IDE can execute it
        return handleGenerateIntegrationPlan({
          apiName,
          language,
          useCase,
          testFramework,
        });
      }
    }

    // Other errors are still thrown
    const message = buildErrorMessage(error, `Failed to generate integration for "${apiName}"`);
    return createErrorResult(message);
  }
}
