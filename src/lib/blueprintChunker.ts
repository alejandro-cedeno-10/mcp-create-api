/**
 * Structure-aware chunking for API Blueprint and OpenAPI/Swagger specs.
 * Splits by logical sections (endpoints, schemas, groups) to enable RAG retrieval.
 * Target: ~500 tokens per chunk (~2000 chars).
 * Content is normalized before storage to reduce noise and token waste.
 */

import * as yaml from "js-yaml";

const MIN_SECTION_CHARS = 80;
const MAX_SECTION_CHARS = 2500;

export interface BlueprintSection {
  title: string;
  content: string;
}

/**
 * Normalizes text for storage: collapse whitespace, trim, reduce token waste.
 * Applied to each chunk before insert so RAG retrieval returns cleaner, token-efficient content.
 */
function normalizeContent(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Chunks a raw blueprint string (API Blueprint markdown, OpenAPI JSON/YAML).
 * Returns sections suitable for FTS indexing and token-bounded retrieval.
 * Not raw insert: Transform step applies structure-aware split + normalization.
 */
export function chunkBlueprint(raw: string): BlueprintSection[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 1. Try JSON (OpenAPI)
  try {
    const spec = JSON.parse(trimmed) as Record<string, unknown>;
    if (spec && typeof spec === "object") {
      return chunkOpenAPI(spec);
    }
  } catch {
    // not JSON
  }

  // 2. Try YAML (OpenAPI/Swagger)
  try {
    const spec = yaml.load(trimmed) as Record<string, unknown> | undefined;
    if (spec && typeof spec === "object") {
      return chunkOpenAPI(spec);
    }
  } catch {
    // not YAML
  }

  // 3. API Blueprint (Markdown)
  return chunkAPIBlueprint(trimmed);
}

/**
 * API Blueprint: split by # Group, ## Resource, ### Action, ## Schema/Model.
 */
function chunkAPIBlueprint(blueprint: string): BlueprintSection[] {
  const lines = blueprint.split("\n");
  const sections: BlueprintSection[] = [];
  let currentTitle = "Overview";
  let currentLines: string[] = [];

  for (const line of lines) {
    // # Group Name
    const h1 = line.match(/^#\s+(?!\s)(.+)/);
    // ## GET /path or ## Schema: Name
    const h2 = line.match(/^##\s+(.+)/);
    // ### Action
    const h3 = line.match(/^###\s+(.+)/);

    const match = h1 ?? h2 ?? h3;
    if (match) {
      const buffered = currentLines.join("\n").trim();
      if (buffered.length >= MIN_SECTION_CHARS) {
        sections.push({ title: currentTitle, content: buffered });
      } else if (sections.length > 0 && buffered.length > 0) {
        sections[sections.length - 1].content += `\n\n${buffered}`;
      }
      currentTitle = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  const lastBuffered = currentLines.join("\n").trim();
  if (lastBuffered.length >= MIN_SECTION_CHARS) {
    sections.push({ title: currentTitle, content: lastBuffered });
  } else if (sections.length > 0 && lastBuffered.length > 0) {
    sections[sections.length - 1].content += `\n\n${lastBuffered}`;
  }

  if (sections.length === 0 && blueprint.length > 0) {
    return splitLongContent({ title: "Full spec", content: blueprint });
  }

  return sections.flatMap(splitLongContent);
}

/**
 * OpenAPI: one chunk per path+method, one per schema (components/schemas).
 */
function chunkOpenAPI(spec: Record<string, unknown>): BlueprintSection[] {
  const sections: BlueprintSection[] = [];
  const info = (spec.info as Record<string, unknown>) || {};
  const apiTitle = (info.title as string) || "API";

  if (spec.paths && typeof spec.paths === "object") {
    for (const [path, pathItem] of Object.entries(spec.paths as Record<string, unknown>)) {
      if (!pathItem || typeof pathItem !== "object") continue;
      const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
      for (const method of methods) {
        const op = (pathItem as Record<string, unknown>)[method];
        if (!op || typeof op !== "object") continue;
        const opObj = op as Record<string, unknown>;
        const summary = (opObj.summary as string) || `${method.toUpperCase()} ${path}`;
        const desc = (opObj.description as string) || "";
        const params = (opObj.parameters as unknown[]) || [];
        const reqBody = (opObj.requestBody as Record<string, unknown>) || {};
        const responses = (opObj.responses as Record<string, unknown>) || {};
        const content = [
          `## ${method.toUpperCase()} ${path}`,
          summary ? `**Summary:** ${summary}` : "",
          desc ? `**Description:** ${desc}` : "",
          params.length ? `**Parameters:** ${params.map((p: any) => p.name || p).join(", ")}` : "",
          reqBody && Object.keys(reqBody).length ? "**Request body:** present" : "",
          Object.keys(responses).length ? `**Responses:** ${Object.keys(responses).join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        sections.push({ title: `${method.toUpperCase()} ${path}`, content });
      }
    }
  }

  const schemas = (spec.components as Record<string, unknown>)?.schemas
    ?? (spec as Record<string, unknown>).definitions;
  if (schemas && typeof schemas === "object") {
    for (const [name, schema] of Object.entries(schemas as Record<string, unknown>)) {
      const s = schema as Record<string, unknown>;
      const props = s.properties ? Object.keys(s.properties as object).join(", ") : "";
      const content = [
        `## Schema: ${name}`,
        (s.description as string) || "",
        props ? `**Properties:** ${props}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      sections.push({ title: `Schema: ${name}`, content: content || name });
    }
  }

  if (sections.length === 0) {
    sections.push({ title: apiTitle, content: JSON.stringify(spec, null, 2).slice(0, MAX_SECTION_CHARS) });
  }

  return sections.flatMap(splitLongContent);
}

function splitLongContent(section: BlueprintSection): BlueprintSection[] {
  const content = normalizeContent(section.content);
  if (content.length <= MAX_SECTION_CHARS) {
    return [{ title: section.title.trim(), content }];
  }

  const paragraphs = content.split(/\n\n+/);
  const chunks: BlueprintSection[] = [];
  let buffer: string[] = [];
  let partIndex = 1;

  for (const para of paragraphs) {
    const prospective = [...buffer, para].join("\n\n");
    if (prospective.length > MAX_SECTION_CHARS && buffer.length > 0) {
      chunks.push({
        title: partIndex === 1 ? section.title : `${section.title} (parte ${partIndex})`,
        content: normalizeContent(buffer.join("\n\n")),
      });
      buffer = [para];
      partIndex++;
    } else {
      buffer.push(para);
    }
  }

  if (buffer.length > 0) {
    chunks.push({
      title: partIndex === 1 ? section.title : `${section.title} (parte ${partIndex})`,
      content: normalizeContent(buffer.join("\n\n")),
    });
  }

  return chunks;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Default token budget for RAG response (model context). */
export const DEFAULT_RAG_TOKEN_BUDGET = 2000;

/**
 * Trims sections to fit within a token budget (models read tokens).
 * Returns sections in order until adding the next would exceed maxTokens.
 */
export function trimSectionsToTokenBudget(
  sections: Array<{ title: string; content: string }>,
  maxTokens: number = DEFAULT_RAG_TOKEN_BUDGET
): Array<{ title: string; content: string }> {
  let total = 0;
  const out: Array<{ title: string; content: string }> = [];
  for (const s of sections) {
    const tokens = estimateTokens(s.title + "\n\n" + s.content);
    if (total + tokens > maxTokens && out.length > 0) break;
    out.push(s);
    total += tokens;
  }
  return out;
}
