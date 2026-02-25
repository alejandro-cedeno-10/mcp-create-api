/**
 * LLM Factory — provider-agnostic LLM instance creator.
 *
 * Reads LLM_PROVIDER from the environment to decide which SDK to use.
 * Defaults to Anthropic so it "inherits" the same Claude that Cursor uses.
 *
 * Supported providers (set via env):
 *   LLM_PROVIDER=anthropic  →  ANTHROPIC_API_KEY  (default)
 *   LLM_PROVIDER=openai     →  OPENAI_API_KEY
 *
 * Optional overrides:
 *   ANTHROPIC_MODEL   (default: claude-3-5-sonnet-20241022)
 *   OPENAI_MODEL      (default: gpt-4o)
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type LLMProvider = "anthropic" | "openai";

function resolveProvider(): LLMProvider {
  const raw = process.env.LLM_PROVIDER?.toLowerCase().trim();
  return raw === "openai" ? "openai" : "anthropic";
}

/**
 * Creates a chat model instance for the configured provider.
 *
 * @param temperature - Sampling temperature (0 = deterministic, 1 = creative)
 */
export function createLLM(temperature = 0): BaseChatModel {
  const provider = resolveProvider();

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required when LLM_PROVIDER=openai"
      );
    }
    return new ChatOpenAI({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      temperature,
      apiKey,
    });
  }

  // Default: Anthropic — same provider as Cursor
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required (set LLM_PROVIDER=openai to use OpenAI instead)"
    );
  }
  return new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022",
    temperature,
    apiKey,
  });
}

/** Returns which provider is currently active */
export function getActiveProvider(): LLMProvider {
  return resolveProvider();
}
