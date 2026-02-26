/**
 * Plan Executor — executes integration plans internally
 *
 * When sampling is not available for the direct workflow,
 * we can still execute the plan using sampling with the prompt templates.
 * This provides the same end result (code + tests) but uses the plan structure.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { requestCompletion } from "./sampler.js";
import { generateIntegrationPlan, type IntegrationPlan } from "./integrationPlan.js";
import { ApiaryService } from "./apiary.js";
import { DocCache } from "./cache.js";
import { integrationPrompts } from "../prompts/integrationPrompts.js";
import type { IntegrationAgentResult } from "./integrationAgent.js";

/**
 * Resolves template placeholders in prompt content
 */
function resolveTemplate(template: string, args: Record<string, unknown>): string {
  let resolved = template;
  for (const [key, value] of Object.entries(args)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    resolved = resolved.replace(placeholder, String(value));
  }
  return resolved;
}

/**
 * Executes an integration plan step-by-step using sampling.
 *
 * This uses the same prompt templates as the MCP prompts,
 * but executes them directly via sampling instead of returning a plan.
 */
export async function executeIntegrationPlan(
  server: Server,
  params: {
    apiName: string;
    language: string;
    useCase: string;
    testFramework?: string;
  }
): Promise<IntegrationAgentResult> {
  const plan = generateIntegrationPlan(params);
  const { apiName, language, useCase, testFramework } = params;

  // Step 1: Fetch blueprint (no LLM needed)
  let blueprint: string;
  const cachedBlueprint = await DocCache.get(apiName);
  if (cachedBlueprint && !(await DocCache.isExpired(apiName))) {
    blueprint = cachedBlueprint;
  } else {
    blueprint = await ApiaryService.fetchBlueprint(apiName);
    await DocCache.set(apiName, blueprint);
  }
  const apiContext = blueprint.slice(0, 12_000);

  // Step 2: Generate code using the prompt template
  const codePrompt = integrationPrompts.find((p) => p.name === "generate_integration_code");
  if (!codePrompt || !codePrompt.template || !Array.isArray(codePrompt.template)) {
    throw new Error("generate_integration_code prompt not found or invalid template");
  }

  const codeSystemPrompt =
    codePrompt.template.find((t: { role: string }) => t.role === "system")?.content ?? "";
  const codeUserPrompt =
    codePrompt.template.find((t: { role: string }) => t.role === "user")?.content ?? "";

  const code = await requestCompletion(
    server,
    [
      {
        role: "user",
        content: resolveTemplate(codeUserPrompt, {
          apiName,
          language,
          useCase,
          blueprint: apiContext,
        }),
      },
    ],
    {
      systemPrompt: resolveTemplate(codeSystemPrompt, { language }),
      maxTokens: 4096,
      temperature: 0,
      includeContext: "thisServer",
      intelligencePriority: 0.9,
      speedPriority: 0.1,
    }
  );

  // Step 3: Generate tests using the prompt template
  const testsPrompt = integrationPrompts.find((p) => p.name === "generate_integration_tests");
  if (!testsPrompt || !testsPrompt.template || !Array.isArray(testsPrompt.template)) {
    throw new Error("generate_integration_tests prompt not found or invalid template");
  }

  const testsSystemPrompt =
    testsPrompt.template.find((t: { role: string }) => t.role === "system")?.content ?? "";
  const testsUserPrompt =
    testsPrompt.template.find((t: { role: string }) => t.role === "user")?.content ?? "";

  const tests = await requestCompletion(
    server,
    [
      {
        role: "user",
        content: resolveTemplate(testsUserPrompt, {
          language,
          testFramework: plan.testFramework,
          code,
        }),
      },
    ],
    {
      systemPrompt: resolveTemplate(testsSystemPrompt, {
        testFramework: plan.testFramework,
      }),
      maxTokens: 4096,
      temperature: 0,
      includeContext: "none",
      intelligencePriority: 0.8,
      speedPriority: 0.2,
    }
  );

  return {
    code,
    tests,
    language: plan.language,
    testFramework: plan.testFramework,
    apiName: plan.apiName,
  };
}
