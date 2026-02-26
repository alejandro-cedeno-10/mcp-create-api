/**
 * MCP Prompts for Integration Code Generation
 *
 * These prompts are templates that the IDE's LLM can invoke.
 * They work even when sampling is not available.
 */

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const integrationPrompts: Prompt[] = [
  {
    name: "generate_integration_code",
    description:
      "Generates production-ready integration code for an Apiary API. " +
      "Use this prompt after fetching the API blueprint. " +
      "Genera código de integración listo para producción para un API de Apiary. " +
      "Usa este prompt después de obtener el blueprint del API.",
    arguments: [
      {
        name: "apiName",
        description: "API name from Apiary",
        required: true,
      },
      {
        name: "language",
        description: "Target programming language (typescript, python, java, go, etc.)",
        required: true,
      },
      {
        name: "useCase",
        description: "What to build with the API (e.g., 'create invoices with line items')",
        required: true,
      },
      {
        name: "blueprint",
        description: "API blueprint content (from get_apiary_blueprint tool)",
        required: true,
      },
    ],
    template: [
      {
        role: "system",
        content: `You are a senior software engineer specializing in API integrations.

Generate production-ready {{language}} code following these principles:
- Clean Code: descriptive names, small functions, single responsibility
- Idiomatic {{language}} patterns and conventions
- Full type safety (TypeScript interfaces, Python type hints, Java generics, etc.)
- Comprehensive error handling with informative messages
- Async/await patterns
- JSDoc or language-appropriate docstrings for public APIs

Return ONLY the code block. No markdown fences, no explanations before or after.`,
      },
      {
        role: "user",
        content: `Generate a {{language}} integration for the API below.

## API Name
{{apiName}}

## Use Case
{{useCase}}

## API Specification
{{blueprint}}

## Requirements
1. HTTP client setup with base URL and authentication headers
2. Typed request/response models (interfaces / dataclasses / DTOs)
3. A service class or module that implements the use case above
4. Proper error handling with informative messages
5. Async/await patterns

Return ONLY the code. No markdown fences, no explanation.`,
      },
    ],
  },
  {
    name: "generate_integration_tests",
    description:
      "Generates unit tests for integration code. " +
      "Use this prompt after generating the integration code. " +
      "Genera tests unitarios para código de integración. " +
      "Usa este prompt después de generar el código de integración.",
    arguments: [
      {
        name: "language",
        description: "Programming language of the code",
        required: true,
      },
      {
        name: "testFramework",
        description: "Test framework to use (Jest, pytest, JUnit, etc.)",
        required: true,
      },
      {
        name: "code",
        description: "The integration code to test (from generate_integration_code prompt)",
        required: true,
      },
    ],
    template: [
      {
        role: "system",
        content: `You are a senior QA engineer expert in {{testFramework}}.

Write comprehensive unit tests following AAA (Arrange, Act, Assert):
- Mock external dependencies — never make real HTTP calls in unit tests
- Aim for high branch and statement coverage
- Follow {{testFramework}} conventions and best practices
- Descriptive test names: "should <action> when <condition>"

Return ONLY the test code. No markdown fences, no explanations.`,
      },
      {
        role: "user",
        content: `Write {{testFramework}} unit tests for the following {{language}} code.

## Code to Test
{{code}}

## Requirements
1. Mock setup: mock the HTTP client / external dependencies
2. Happy path: successful API calls return expected results
3. Error paths: network errors, 4xx/5xx HTTP responses, invalid payloads
4. Edge cases: empty responses, null/undefined fields, timeouts
5. At least one integration-style test showing the full flow

Return ONLY the test code. No markdown fences, no explanation.`,
      },
    ],
  },
];
