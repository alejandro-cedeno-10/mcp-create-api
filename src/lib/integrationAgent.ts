/**
 * Integration Agent — multi-step workflow using MCP sampling
 *
 * This is the MCP-native equivalent of a LangGraph StateGraph.
 * Instead of using LangGraph nodes + LLM API keys, each step that
 * needs text generation calls the MCP client's own LLM via sampling.
 *
 * Workflow (3 sequential steps, equivalent to 3 LangGraph nodes):
 *
 *   Step 1 — fetchApiContext   (no LLM — reads cache/Apiary)
 *   Step 2 — generateCode      (sampling → client's LLM)
 *   Step 3 — generateTests     (sampling → client's LLM)
 *
 * Why not LangGraph here?
 *   LangGraph is for building standalone agents that own their LLM.
 *   Here we ARE a tool being called by an agent (the IDE's LLM).
 *   MCP Sampling lets us use that same LLM — no API key, no extra deps.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { requestCompletion } from "./sampler.js";
import { DocCache } from "./cache.js";
import { ApiaryService } from "./apiary.js";

// ---------------------------------------------------------------------------
// Language → test framework mapping
// ---------------------------------------------------------------------------

const TEST_FRAMEWORK_MAP: Record<string, string> = {
  typescript: "Jest + ts-jest",
  ts: "Jest + ts-jest",
  javascript: "Jest",
  js: "Jest",
  python: "pytest",
  py: "pytest",
  java: "JUnit 5 + Mockito",
  kotlin: "JUnit 5 + MockK",
  csharp: "xUnit + Moq",
  "c#": "xUnit + Moq",
  go: "testify",
  php: "PHPUnit",
  ruby: "RSpec",
  rust: "cargo test",
  swift: "XCTest",
};

export function resolveTestFramework(language: string, override?: string): string {
  return override ?? TEST_FRAMEWORK_MAP[language.toLowerCase()] ?? "Jest";
}

// ---------------------------------------------------------------------------
// Step 1: Load API context (no LLM needed)
// ---------------------------------------------------------------------------

async function fetchApiContext(apiName: string): Promise<string> {
  let blueprint = await DocCache.get(apiName);

  if (!blueprint || (await DocCache.isExpired(apiName))) {
    blueprint = await ApiaryService.fetchBlueprint(apiName);
    await DocCache.set(apiName, blueprint);
  }

  return blueprint.slice(0, 12_000);
}

// ---------------------------------------------------------------------------
// Step 2: Generate integration code via MCP sampling
// ---------------------------------------------------------------------------

async function generateCode(
  server: Server,
  params: {
    apiContext: string;
    language: string;
    useCase: string;
    apiName: string;
  }
): Promise<string> {
  const { language, useCase, apiName, apiContext } = params;

  return requestCompletion(
    server,
    [
      {
        role: "user",
        content:
          `Generate a ${language} integration for the API below.\n\n` +
          `## Use Case\n${useCase}\n\n` +
          `## API Name\n${apiName}\n\n` +
          `## API Specification (excerpt)\n${apiContext}\n\n` +
          `## Requirements\n` +
          `1. HTTP client setup with base URL and authentication headers\n` +
          `2. Typed request/response models (interfaces / dataclasses / DTOs)\n` +
          `3. A service class or module that implements the use case above\n` +
          `4. Proper error handling with informative messages\n` +
          `5. Async/await patterns\n\n` +
          `Return ONLY the code. No markdown fences, no explanation.`,
      },
    ],
    {
      systemPrompt:
        `You are a senior software engineer specializing in API integrations.\n` +
        `Generate production-ready ${language} code following these principles:\n` +
        `- Clean Code: descriptive names, small functions, single responsibility\n` +
        `- Idiomatic ${language} patterns and conventions\n` +
        `- Full type safety (TypeScript interfaces, Python type hints, Java generics, etc.)\n` +
        `- Comprehensive error handling\n` +
        `- JSDoc or language-appropriate docstrings for public APIs\n` +
        `Return ONLY the code block — no markdown fences, no explanations before or after.`,
      maxTokens: 4096,
      temperature: 0,
      includeContext: "thisServer",
      intelligencePriority: 0.9,
      speedPriority: 0.1,
    }
  );
}

// ---------------------------------------------------------------------------
// Step 3: Generate unit tests via MCP sampling
// ---------------------------------------------------------------------------

async function generateTests(
  server: Server,
  params: {
    code: string;
    language: string;
    testFramework: string;
  }
): Promise<string> {
  const { code, language, testFramework } = params;

  return requestCompletion(
    server,
    [
      {
        role: "user",
        content:
          `Write ${testFramework} unit tests for the following ${language} code.\n\n` +
          `## Code to Test\n${code}\n\n` +
          `## Requirements\n` +
          `1. Mock all external HTTP calls — no real network requests in unit tests\n` +
          `2. Happy path: successful calls return expected results\n` +
          `3. Error paths: network errors, 4xx/5xx HTTP responses, invalid payloads\n` +
          `4. Edge cases: empty responses, null/undefined fields, timeouts\n` +
          `5. Descriptive test names: "should <action> when <condition>"\n\n` +
          `Return ONLY the test code. No markdown fences, no explanation.`,
      },
    ],
    {
      systemPrompt:
        `You are a senior QA engineer expert in ${testFramework}.\n` +
        `Write comprehensive unit tests following AAA (Arrange, Act, Assert):\n` +
        `- Mock external dependencies — never make real HTTP calls\n` +
        `- Aim for high branch and statement coverage\n` +
        `- Follow ${testFramework} conventions and best practices\n` +
        `Return ONLY the test code — no markdown fences, no explanations.`,
      maxTokens: 4096,
      temperature: 0,
      includeContext: "none",
      intelligencePriority: 0.8,
      speedPriority: 0.2,
    }
  );
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface IntegrationAgentParams {
  apiName: string;
  language: string;
  useCase: string;
  testFramework?: string;
}

export interface IntegrationAgentResult {
  code: string;
  tests: string;
  language: string;
  testFramework: string;
  apiName: string;
}

/**
 * Runs the 3-step integration agent using MCP sampling.
 *
 * The LLM is provided by the MCP client (Cursor, OpenCode, Claude Desktop…)
 * — the server needs no API key and no LangChain dependency.
 *
 * @param server  The MCP Server instance (used to send sampling requests)
 * @param params  What to generate
 */
export async function runIntegrationAgent(
  server: Server,
  params: IntegrationAgentParams
): Promise<IntegrationAgentResult> {
  const language = params.language.toLowerCase().trim();
  const testFramework = resolveTestFramework(language, params.testFramework);

  const apiContext = await fetchApiContext(params.apiName);

  const code = await generateCode(server, {
    apiContext,
    language,
    useCase: params.useCase,
    apiName: params.apiName,
  });

  const tests = await generateTests(server, { code, language, testFramework });

  return {
    code,
    tests,
    language,
    testFramework,
    apiName: params.apiName,
  };
}
