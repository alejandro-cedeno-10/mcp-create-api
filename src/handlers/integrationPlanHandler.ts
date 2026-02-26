/**
 * Handler for generate_api_integration_plan tool
 *
 * Returns a structured plan that the IDE's LLM can execute using MCP prompts.
 * This is the fallback when sampling is not available.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { integrationArgumentsSchema } from "../tools/schemas.js";
import { createErrorResult, createSuccessResult } from "../utils/results.js";
import { generateIntegrationPlan } from "../lib/integrationPlan.js";

/**
 * Handles the generate_api_integration_plan tool call.
 *
 * Returns a JSON plan that the IDE can execute step-by-step using:
 * - Tools (get_apiary_blueprint)
 * - Prompts (generate_integration_code, generate_integration_tests)
 */
export async function handleGenerateIntegrationPlan(
  rawArguments: unknown
): Promise<CallToolResult> {
  const parsedArgs = integrationArgumentsSchema.safeParse(rawArguments ?? {});
  if (!parsedArgs.success) {
    return createErrorResult(`Invalid arguments: ${parsedArgs.error.message}`);
  }

  const { apiName, language, useCase, testFramework } = parsedArgs.data;

  const plan = generateIntegrationPlan({
    apiName,
    language,
    useCase,
    testFramework,
  });

  // Return plan as formatted JSON for readability
  const planJson = JSON.stringify(plan, null, 2);

  const response = `# Integration Plan — \`${apiName}\` (${language.charAt(0).toUpperCase() + language.slice(1)})

> This plan can be executed by your IDE's LLM using the MCP prompts listed below.

## Plan Overview

- **API:** \`${apiName}\`
- **Language:** \`${language}\`
- **Test Framework:** \`${plan.testFramework}\`
- **Use Case:** ${useCase}

## Execution Steps

1. **Fetch Blueprint** — Use tool \`get_apiary_blueprint\`
2. **Generate Code** — Use prompt \`generate_integration_code\`
3. **Generate Tests** — Use prompt \`generate_integration_tests\`

## Plan JSON

\`\`\`json
${planJson}
\`\`\`

## How to Execute

Your IDE's LLM should:
1. Invoke \`get_apiary_blueprint\` with the API name
2. Invoke prompt \`generate_integration_code\` with the blueprint result
3. Invoke prompt \`generate_integration_tests\` with the generated code

Each step depends on the previous one's output.`;

  return createSuccessResult(response);
}
