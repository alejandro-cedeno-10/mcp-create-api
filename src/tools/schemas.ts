/**
 * Zod schemas for input validation
 */

import { z } from "zod";

/**
 * Schema for blueprint fetch arguments
 */
export const blueprintArgumentsSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required"),
  forceRefresh: z.boolean().optional().default(false)
});

/**
 * Schema for blueprint summary arguments
 */
export const blueprintSummaryArgumentsSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required"),
  includeExamples: z.boolean().optional().default(false)
});

/**
 * Schema for search_apiary_blueprint (RAG) arguments
 */
export const searchBlueprintArgumentsSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required"),
  query: z.string().trim().optional(),
  maxSections: z.number().int().min(1).max(15).optional().default(5),
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Schema for get_apiary_blueprint_overview (summary from indexed sections)
 */
export const overviewBlueprintArgumentsSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required"),
  maxSections: z.number().int().min(1).max(20).optional().default(10),
  maxTokens: z.number().int().min(400).max(4000).optional().default(2000),
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Schema for generate_api_integration arguments
 */
export const integrationArgumentsSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required"),
  language: z.string().trim().min(1, "language is required"),
  useCase: z.string().trim().min(1, "useCase is required"),
  testFramework: z.string().trim().optional(),
});

/**
 * Type exports
 */
export type BlueprintArguments = z.infer<typeof blueprintArgumentsSchema>;
export type BlueprintSummaryArguments = z.infer<typeof blueprintSummaryArgumentsSchema>;
export type OverviewBlueprintArguments = z.infer<typeof overviewBlueprintArgumentsSchema>;
export type SearchBlueprintArguments = z.infer<typeof searchBlueprintArgumentsSchema>;
export type IntegrationArguments = z.infer<typeof integrationArgumentsSchema>;
