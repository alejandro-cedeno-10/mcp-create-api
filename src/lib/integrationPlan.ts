/**
 * Integration Plan Generator
 *
 * Creates a structured plan for generating API integration code + tests.
 * This plan can be executed by the IDE's LLM using MCP prompts.
 *
 * This is the fallback when sampling is not available.
 */

import { resolveTestFramework } from "./integrationAgent.js";

export interface PlanStep {
  id: number;
  action: string;
  description: string;
  tool?: string;
  prompt?: string;
  args: Record<string, unknown>;
  dependsOn?: number[];
}

export interface IntegrationPlan {
  apiName: string;
  language: string;
  useCase: string;
  testFramework: string;
  steps: PlanStep[];
}

/**
 * Generates a structured plan for integration code generation.
 *
 * The plan can be executed by the IDE's LLM:
 * 1. Fetch blueprint using the tool
 * 2. Generate code using the prompt
 * 3. Generate tests using the prompt
 *
 * @param params  Integration parameters
 */
export function generateIntegrationPlan(params: {
  apiName: string;
  language: string;
  useCase: string;
  testFramework?: string;
}): IntegrationPlan {
  const language = params.language.toLowerCase().trim();
  const testFramework = resolveTestFramework(language, params.testFramework);

  return {
    apiName: params.apiName,
    language,
    useCase: params.useCase,
    testFramework,
    steps: [
      {
        id: 1,
        action: "fetch_blueprint",
        description: `Fetch the complete API blueprint for ${params.apiName}`,
        tool: "get_apiary_blueprint",
        args: {
          apiName: params.apiName,
          forceRefresh: false,
        },
      },
      {
        id: 2,
        action: "generate_code",
        description: `Generate ${language} integration code`,
        prompt: "generate_integration_code",
        args: {
          apiName: params.apiName,
          language,
          useCase: params.useCase,
          blueprint: "{{step1.output}}", // placeholder for step 1 output
        },
        dependsOn: [1],
      },
      {
        id: 3,
        action: "generate_tests",
        description: `Generate ${testFramework} unit tests`,
        prompt: "generate_integration_tests",
        args: {
          language,
          testFramework,
          code: "{{step2.output}}", // placeholder for step 2 output
        },
        dependsOn: [2],
      },
    ],
  };
}
