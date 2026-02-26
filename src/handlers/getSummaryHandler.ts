/**
 * Handler for get_apiary_blueprint_summary tool
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiaryToolClient, DocCacheAdapter } from "../types/index.js";
import { blueprintSummaryArgumentsSchema } from "../tools/schemas.js";
import { createErrorResult, createSuccessResult, buildErrorMessage } from "../utils/results.js";
import { summarizeBlueprint } from "../lib/blueprintSummarizer.js";

/**
 * Formats a blueprint summary as a readable text response.
 * @param originalApiName - The technical API name provided by the caller (used for the tip and as title fallback)
 */
function formatSummaryResponse(summary: any, originalApiName: string): string {
  const displayTitle = summary.apiName && summary.apiName !== 'Unknown API'
    ? summary.apiName
    : originalApiName;

  let text = `# ${displayTitle}\n\n`;
  
  if (summary.version) {
    text += `**Version:** ${summary.version}\n`;
  }
  
  if (summary.baseUrl) {
    text += `**Base URL:** ${summary.baseUrl}\n`;
  }
  
  text += `\n## 📊 Summary Statistics\n\n`;
  text += `- **Endpoints:** ${summary.endpoints.length}\n`;
  text += `- **Models/Schemas:** ${summary.models.length}\n`;
  text += `- **Token Efficiency:** ${summary.tokenCount} tokens`;
  
  if (summary.originalTokenCount) {
    const reduction = Math.round((1 - summary.tokenCount / summary.originalTokenCount) * 100);
    text += ` (${reduction}% smaller than full blueprint)\n`;
  } else {
    text += '\n';
  }
  
  text += `\n## 🔗 Endpoints (${summary.endpoints.length})\n\n`;
  
  const byMethod = summary.endpoints.reduce((acc: any, ep: any) => {
    if (!acc[ep.method]) acc[ep.method] = [];
    acc[ep.method].push(ep);
    return acc;
  }, {});
  
  for (const [method, eps] of Object.entries(byMethod) as [string, any[]][]) {
    text += `### ${method}\n\n`;
    for (const ep of eps) {
      text += `- \`${ep.method} ${ep.path}\``;
      if (ep.description) {
        text += ` - ${ep.description}`;
      }
      text += '\n';
    }
    text += '\n';
  }
  
  if (summary.models.length > 0) {
    text += `## 📦 Models/Schemas (${summary.models.length})\n\n`;
    for (const model of summary.models.slice(0, 20)) {
      text += `- **${model.name}**\n`;
    }
    if (summary.models.length > 20) {
      text += `- ... and ${summary.models.length - 20} more models\n`;
    }
  }
  
  text += `\n---\n💡 **Tip:** Use \`get_apiary_blueprint("${originalApiName}")\` to get the complete specification.\n`;
  
  return text;
}

/**
 * Handles the get_apiary_blueprint_summary tool call
 */
export async function handleGetBlueprintSummary(
  rawArguments: unknown,
  client: ApiaryToolClient,
  cache: DocCacheAdapter
): Promise<CallToolResult> {
  const parsedArgs = blueprintSummaryArgumentsSchema.safeParse(rawArguments ?? {});
  if (!parsedArgs.success) {
    return createErrorResult(`Invalid arguments: ${parsedArgs.error.message}`);
  }

  const { apiName, includeExamples } = parsedArgs.data;

  try {
    let blueprint = await cache.get(apiName);
    
    if (!blueprint || await cache.isExpired(apiName)) {
      blueprint = await client.fetchBlueprint(apiName);
      await cache.set(apiName, blueprint);
    }

    const summary = summarizeBlueprint(blueprint, { includeExamples });
    
    const summaryText = formatSummaryResponse(summary, apiName);
    
    return createSuccessResult(summaryText);
  } catch (error) {
    const message = buildErrorMessage(error, "Failed to generate blueprint summary");
    return createErrorResult(message);
  }
}
