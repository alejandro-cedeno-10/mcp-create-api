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
 * Type exports
 */
export type BlueprintArguments = z.infer<typeof blueprintArgumentsSchema>;
export type BlueprintSummaryArguments = z.infer<typeof blueprintSummaryArgumentsSchema>;
