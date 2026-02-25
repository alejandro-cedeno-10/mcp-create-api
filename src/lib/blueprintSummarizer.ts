/**
 * Blueprint Summarizer
 * 
 * Extrae información esencial de un blueprint completo para reducir tokens
 */

interface EndpointSummary {
  method: string;
  path: string;
  description?: string;
  parameters?: string[];
  responses?: string[];
}

interface ModelSummary {
  name: string;
  properties?: string[];
}

interface BlueprintSummary {
  apiName: string;
  version?: string;
  baseUrl?: string;
  endpoints: EndpointSummary[];
  models: ModelSummary[];
  tokenCount: number;
  originalTokenCount?: number;
}

/**
 * Parsea un blueprint OpenAPI/Swagger y extrae información esencial
 */
export function summarizeBlueprint(
  blueprint: string,
  options: { includeExamples?: boolean } = {}
): BlueprintSummary {
  const { includeExamples = false } = options;
  
  try {
    // Intentar parsear como JSON (OpenAPI/Swagger)
    const spec = JSON.parse(blueprint);
    return summarizeOpenAPI(spec, includeExamples);
  } catch {
    // Si no es JSON, intentar parsear como API Blueprint
    return summarizeAPIBlueprint(blueprint, includeExamples);
  }
}

/**
 * Resume un spec OpenAPI/Swagger
 */
function summarizeOpenAPI(spec: any, includeExamples: boolean): BlueprintSummary {
  const endpoints: EndpointSummary[] = [];
  const models: ModelSummary[] = [];
  
  // Extraer endpoints
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries<any>(spec.paths)) {
      for (const [method, operation] of Object.entries<any>(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) {
          endpoints.push({
            method: method.toUpperCase(),
            path,
            description: operation.summary || operation.description,
            parameters: operation.parameters?.map((p: any) => p.name) || [],
            responses: Object.keys(operation.responses || {})
          });
        }
      }
    }
  }
  
  // Extraer modelos/schemas
  const schemas = spec.components?.schemas || spec.definitions || {};
  for (const [name, schema] of Object.entries<any>(schemas)) {
    models.push({
      name,
      properties: schema.properties ? Object.keys(schema.properties) : []
    });
  }
  
  const summary = {
    apiName: spec.info?.title || 'Unknown API',
    version: spec.info?.version,
    baseUrl: spec.servers?.[0]?.url || spec.host,
    endpoints,
    models,
    tokenCount: 0,
    originalTokenCount: estimateTokenCount(JSON.stringify(spec))
  };
  
  const summaryText = formatSummaryAsText(summary, includeExamples);
  summary.tokenCount = estimateTokenCount(summaryText);
  
  return summary;
}

/**
 * Resume un API Blueprint
 */
function summarizeAPIBlueprint(blueprint: string, includeExamples: boolean): BlueprintSummary {
  const endpoints: EndpointSummary[] = [];
  const models: ModelSummary[] = [];
  
  // Regex para extraer endpoints (simple parsing)
  const endpointRegex = /##?\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)/gi;
  let match;
  
  while ((match = endpointRegex.exec(blueprint)) !== null) {
    endpoints.push({
      method: match[1].toUpperCase(),
      path: match[2].trim()
    });
  }
  
  // Extraer modelos/schemas
  const schemaRegex = /##?\s+(?:Schema|Model):\s+(.+)/gi;
  while ((match = schemaRegex.exec(blueprint)) !== null) {
    models.push({
      name: match[1].trim()
    });
  }
  
  const summary = {
    apiName: extractAPIName(blueprint),
    endpoints,
    models,
    tokenCount: 0,
    originalTokenCount: estimateTokenCount(blueprint)
  };
  
  const summaryText = formatSummaryAsText(summary, includeExamples);
  summary.tokenCount = estimateTokenCount(summaryText);
  
  return summary;
}

/**
 * Extrae el nombre del API de un blueprint
 */
function extractAPIName(blueprint: string): string {
  // Buscar en metadata
  const nameMatch = blueprint.match(/(?:FORMAT:|HOST:|NAME:)\s*(.+)/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  
  // Buscar primer header
  const headerMatch = blueprint.match(/^#\s+(.+)/m);
  if (headerMatch) {
    return headerMatch[1].trim();
  }
  
  return 'Unknown API';
}

/**
 * Estima el conteo de tokens (aproximación: 1 token ≈ 4 caracteres)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Formatea el resumen como texto legible
 */
function formatSummaryAsText(summary: BlueprintSummary, includeExamples: boolean): string {
  let text = `# ${summary.apiName}\n\n`;
  
  if (summary.version) {
    text += `**Version:** ${summary.version}\n`;
  }
  
  if (summary.baseUrl) {
    text += `**Base URL:** ${summary.baseUrl}\n`;
  }
  
  text += `\n## 📊 Summary Statistics\n\n`;
  text += `- **Endpoints:** ${summary.endpoints.length}\n`;
  text += `- **Models/Schemas:** ${summary.models.length}\n`;
  text += `- **Token Reduction:** ${summary.originalTokenCount || 'N/A'} → ${summary.tokenCount} tokens `;
  
  if (summary.originalTokenCount) {
    const reduction = Math.round((1 - summary.tokenCount / summary.originalTokenCount) * 100);
    text += `(${reduction}% reduction)\n`;
  }
  
  text += `\n## 🔗 Endpoints (${summary.endpoints.length})\n\n`;
  
  // Agrupar por método
  const byMethod = summary.endpoints.reduce((acc, ep) => {
    if (!acc[ep.method]) acc[ep.method] = [];
    acc[ep.method].push(ep);
    return acc;
  }, {} as Record<string, EndpointSummary[]>);
  
  for (const [method, eps] of Object.entries(byMethod)) {
    text += `### ${method}\n\n`;
    for (const ep of eps) {
      text += `- \`${ep.method} ${ep.path}\``;
      if (ep.description) {
        text += ` - ${ep.description}`;
      }
      text += '\n';
      
      if (includeExamples) {
        if (ep.parameters && ep.parameters.length > 0) {
          text += `  - Parameters: ${ep.parameters.join(', ')}\n`;
        }
        if (ep.responses && ep.responses.length > 0) {
          text += `  - Responses: ${ep.responses.join(', ')}\n`;
        }
      }
    }
    text += '\n';
  }
  
  if (summary.models.length > 0) {
    text += `## 📦 Models/Schemas (${summary.models.length})\n\n`;
    for (const model of summary.models) {
      text += `- **${model.name}**`;
      if (includeExamples && model.properties && model.properties.length > 0) {
        text += `\n  - Properties: ${model.properties.slice(0, 10).join(', ')}`;
        if (model.properties.length > 10) {
          text += ` ... and ${model.properties.length - 10} more`;
        }
      }
      text += '\n';
    }
  }
  
  text += `\n---\n💡 **Tip:** Use \`get_apiary_blueprint\` to get the complete specification with full details.\n`;
  
  return text;
}

export { BlueprintSummary, EndpointSummary, ModelSummary };
