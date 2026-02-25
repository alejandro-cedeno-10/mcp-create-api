/**
 * Integration Agent — LangGraph StateGraph
 *
 * Workflow:
 *   START
 *     ↓
 *   fetchApiContext  — loads blueprint from cache or Apiary
 *     ↓
 *   generateCode     — LLM writes best-practice integration code
 *     ↓
 *   generateTests    — LLM writes unit tests for that code
 *     ↓
 *   END
 *
 * The LLM used is resolved at runtime from LLM_PROVIDER env var,
 * so it "inherits" whichever model the invoker is already using
 * (e.g. Anthropic Claude when called from Cursor).
 */

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createLLM } from "./llmFactory.js";
import { DocCache } from "./cache.js";
import { ApiaryService } from "./apiary.js";

// ---------------------------------------------------------------------------
// State definition
// ---------------------------------------------------------------------------

const IntegrationState = Annotation.Root({
  apiName: Annotation<string>(),
  language: Annotation<string>(),
  useCase: Annotation<string>(),
  testFramework: Annotation<string>(),
  apiContext: Annotation<string>({ reducer: (_, y) => y }),
  generatedCode: Annotation<string>({ reducer: (_, y) => y }),
  generatedTests: Annotation<string>({ reducer: (_, y) => y }),
});

type State = typeof IntegrationState.State;

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
  if (override) return override;
  return TEST_FRAMEWORK_MAP[language.toLowerCase()] ?? "Jest";
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * Node 1: Load API context (blueprint) from cache or Apiary.
 * Truncates to 12 000 chars to keep the LLM prompt manageable
 * while still covering all endpoints and models.
 */
async function fetchApiContext(state: State): Promise<Partial<State>> {
  let blueprint = await DocCache.get(state.apiName);

  if (!blueprint || (await DocCache.isExpired(state.apiName))) {
    blueprint = await ApiaryService.fetchBlueprint(state.apiName);
    await DocCache.set(state.apiName, blueprint);
  }

  // Keep first 12k chars: usually covers all endpoints and models
  const apiContext = blueprint.slice(0, 12_000);
  return { apiContext };
}

/**
 * Node 2: Generate integration code using the LLM.
 */
async function generateCode(state: State): Promise<Partial<State>> {
  const llm = createLLM(0);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a senior software engineer specializing in API integrations.
Generate production-ready {language} code following these principles:
- Clean Code (descriptive names, small functions, single responsibility)
- Best practices and idiomatic {language} patterns
- Proper error handling with informative messages
- Async/await patterns
- If {language} is TypeScript: add full type safety, interfaces/types, no 'any'
- If {language} is Python: use type hints, dataclasses or Pydantic models
- If {language} is Java/Kotlin: use proper OOP, immutable DTOs, Optional
- Include JSDoc/docstrings for public functions
Return ONLY the code — no markdown fences, no explanation before or after.`,
    ],
    [
      "human",
      `Generate a {language} client integration for the following API.

## API Name
{apiName}

## Use Case
{useCase}

## API Specification (excerpt)
{apiContext}

## Requirements
1. HTTP client setup with base URL and authentication headers
2. Typed request/response models (DTOs / interfaces / dataclasses)
3. A service class or module with functions for the use case above
4. Retry logic for transient errors (optional but recommended)
5. Comprehensive error handling

Return only the code.`,
    ],
  ]);

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const generatedCode = await chain.invoke({
    language: state.language,
    apiName: state.apiName,
    useCase: state.useCase,
    apiContext: state.apiContext,
  });

  return { generatedCode };
}

/**
 * Node 3: Generate unit tests for the code produced in Node 2.
 */
async function generateTests(state: State): Promise<Partial<State>> {
  const llm = createLLM(0);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a senior QA engineer expert in {testFramework}.
Write comprehensive unit tests following these principles:
- AAA pattern: Arrange → Act → Assert
- Mock all external HTTP calls / dependencies (no real network calls in unit tests)
- Descriptive test names: "should <action> when <condition>"
- Test happy paths AND error/edge cases
- Aim for high branch coverage
- Follow {testFramework} conventions and best practices
Return ONLY the test code — no markdown fences, no explanation.`,
    ],
    [
      "human",
      `Write {testFramework} unit tests for the following {language} integration code.

## Integration Code
{generatedCode}

## Requirements
1. Mock setup: mock the HTTP client / external dependencies
2. Happy path: successful API calls return expected results
3. Error paths: network errors, 4xx/5xx responses, invalid payloads
4. Edge cases: empty responses, null fields, timeouts
5. At least one integration-style test showing the full flow

Return only the test code.`,
    ],
  ]);

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const generatedTests = await chain.invoke({
    testFramework: state.testFramework,
    language: state.language,
    generatedCode: state.generatedCode,
  });

  return { generatedTests };
}

// ---------------------------------------------------------------------------
// Graph assembly
// ---------------------------------------------------------------------------

function buildGraph() {
  const builder = new StateGraph(IntegrationState);

  builder
    .addNode("fetchApiContext", fetchApiContext)
    .addNode("generateCode", generateCode)
    .addNode("generateTests", generateTests)
    .addEdge(START, "fetchApiContext")
    .addEdge("fetchApiContext", "generateCode")
    .addEdge("generateCode", "generateTests")
    .addEdge("generateTests", END);

  return builder.compile();
}

// ---------------------------------------------------------------------------
// Public API
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
 * Runs the LangGraph integration agent.
 *
 * The LLM is resolved from env vars at runtime — set LLM_PROVIDER and the
 * matching API key to "inherit" the model you already use in Cursor.
 */
export async function runIntegrationAgent(
  params: IntegrationAgentParams
): Promise<IntegrationAgentResult> {
  const language = params.language.toLowerCase().trim();
  const testFramework = resolveTestFramework(language, params.testFramework);

  const graph = buildGraph();

  const result = await graph.invoke({
    apiName: params.apiName,
    language,
    useCase: params.useCase,
    testFramework,
    apiContext: "",
    generatedCode: "",
    generatedTests: "",
  });

  return {
    code: result.generatedCode,
    tests: result.generatedTests,
    language,
    testFramework,
    apiName: params.apiName,
  };
}
