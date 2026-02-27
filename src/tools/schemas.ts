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
 * Schema for generate_api_integration arguments
 */
export const integrationArgumentsSchema = z.object({
  apiName: z.string().trim().min(1, "apiName is required"),
  language: z.string().trim().min(1, "language is required"),
  useCase: z.string().trim().min(1, "useCase is required"),
  testFramework: z.string().trim().optional(),
});

/**
 * Schema for alegra_list_modules arguments
 */
export const alegraListModulesSchema = z.object({
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Schema for alegra_list_submodules arguments
 */
export const alegraListSubmodulesSchema = z.object({
  module: z.string().trim().min(1, "module name is required"),
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Schema for alegra_get_endpoint_docs arguments
 */
export const alegraGetEndpointSchema = z.object({
  module: z.string().trim().min(1, "module name is required"),
  submodule: z.string().trim().min(1, "submodule name is required"),
  operation: z.string().trim().optional(),
  query: z.string().trim().optional(),
  forceRefresh: z.boolean().optional().default(false),
});

/**
 * Type exports
 */
export type BlueprintArguments = z.infer<typeof blueprintArgumentsSchema>;
export type BlueprintSummaryArguments = z.infer<typeof blueprintSummaryArgumentsSchema>;
export type IntegrationArguments = z.infer<typeof integrationArgumentsSchema>;
export type AlegraListModulesArguments = z.infer<typeof alegraListModulesSchema>;
export type AlegraListSubmodulesArguments = z.infer<typeof alegraListSubmodulesSchema>;
export type AlegraGetEndpointArguments = z.infer<typeof alegraGetEndpointSchema>;
