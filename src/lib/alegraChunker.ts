/**
 * Splits cleaned markdown content into titled sections.
 *
 * Splitting strategy:
 *   1. Split by H2 (##) and H3 (###) headings
 *   2. Sections with no heading use the page title as title
 *   3. Sections shorter than MIN_CHARS are merged with the previous one
 *      to avoid tiny useless chunks that waste rows
 *   4. Sections longer than MAX_CHARS are split at paragraph boundaries
 *      to keep each chunk under the token budget
 *
 * Token budget target: ~500 tokens per section ≈ 2000 chars
 */

const MIN_SECTION_CHARS = 80;
const MAX_SECTION_CHARS = 2500;

export interface DocSection {
  title: string;
  content: string;
}

/**
 * Splits a markdown string into sections, one per H2/H3 heading.
 */
export function splitIntoSections(markdown: string, pageTitle = ""): DocSection[] {
  const lines = markdown.split("\n");
  const rawSections: DocSection[] = [];

  let currentTitle = pageTitle;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Match ## Heading or ### Heading (H2 / H3 only — H4+ are too granular)
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);

    if (headingMatch) {
      const buffered = currentLines.join("\n").trim();
      if (buffered.length >= MIN_SECTION_CHARS) {
        rawSections.push({ title: currentTitle, content: buffered });
      } else if (rawSections.length > 0 && buffered.length > 0) {
        // Merge tiny leading content into previous section
        rawSections[rawSections.length - 1].content += `\n\n${buffered}`;
      }
      currentTitle = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last buffer
  const lastBuffered = currentLines.join("\n").trim();
  if (lastBuffered.length >= MIN_SECTION_CHARS) {
    rawSections.push({ title: currentTitle, content: lastBuffered });
  } else if (rawSections.length > 0 && lastBuffered.length > 0) {
    rawSections[rawSections.length - 1].content += `\n\n${lastBuffered}`;
  }

  // If no sections were created (page has no H2/H3), treat whole content as one
  if (rawSections.length === 0 && markdown.trim().length > 0) {
    return splitLongSection({ title: pageTitle, content: markdown.trim() });
  }

  // Enforce max size — split any oversized section at paragraph boundaries
  return rawSections.flatMap(splitLongSection);
}

/**
 * If a section is too long, splits it at double-newline paragraph boundaries.
 */
function splitLongSection(section: DocSection): DocSection[] {
  if (section.content.length <= MAX_SECTION_CHARS) return [section];

  const paragraphs = section.content.split(/\n\n+/);
  const chunks: DocSection[] = [];
  let buffer: string[] = [];
  let partIndex = 1;

  for (const para of paragraphs) {
    const prospective = [...buffer, para].join("\n\n");
    if (prospective.length > MAX_SECTION_CHARS && buffer.length > 0) {
      chunks.push({
        title: partIndex === 1 ? section.title : `${section.title} (parte ${partIndex})`,
        content: buffer.join("\n\n"),
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
      content: buffer.join("\n\n"),
    });
  }

  return chunks;
}

/**
 * Formats sections for MCP tool output.
 * Returns a compact markdown string with section titles + content.
 */
export function formatSections(
  sections: DocSection[],
  pageUrl: string,
  query?: string
): string {
  const queryNote = query ? ` | búsqueda: "${query}"` : " | vista completa";
  const header = [
    `**Fuente:** ${pageUrl}${queryNote}`,
    `**Secciones:** ${sections.length}`,
    "",
    "---",
  ];

  const body = sections.flatMap((sec, i) => {
    const lines: string[] = [];
    if (sec.title) {
      lines.push(`\n## ${sec.title}`);
    } else if (i === 0) {
      lines.push("\n## Descripción general");
    }
    lines.push(sec.content);
    return lines;
  });

  return [...header, ...body].join("\n");
}

/**
 * Estimates approximate token count (4 chars ≈ 1 token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
