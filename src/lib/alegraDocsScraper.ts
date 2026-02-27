/**
 * Scraper for Alegra public API documentation (developer.alegra.com).
 *
 * Strategy (cascade):
 *   1. Try to extract Next.js __NEXT_DATA__ JSON embedded in the page HTML
 *      (ReadMe.io v2+ renders via Next.js and bakes navigation into the page)
 *   2. Fall back to regex-based HTML parsing of the sidebar nav
 *
 * Endpoint pages:
 *   - Fetches the URL, strips chrome (nav/header/footer/scripts)
 *   - Returns readable text content
 */

export const ALEGRA_BASE_URL = "https://developer.alegra.com";

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (compatible; AlegraDocsMCPBot/1.0; +https://github.com/alegra)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es,en;q=0.8",
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AlegraSubmodule {
  name: string;
  url: string;
  slug: string;
}

export interface AlegraModule {
  name: string;
  slug: string;
  submodules: AlegraSubmodule[];
}

export interface AlegraDocsIndex {
  fetchedAt: string;
  baseUrl: string;
  modules: AlegraModule[];
}

/**
 * A single HTTP operation inside a submodule page.
 * Example: "Crear factura de proveedor" inside "Facturas de proveedor".
 */
export interface AlegraOperation {
  name: string;
  url: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: FETCH_HEADERS });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

// ---------------------------------------------------------------------------
// Index parsing — Strategy 1: Next.js __NEXT_DATA__
// ---------------------------------------------------------------------------

/**
 * ReadMe.io v2+ embeds all navigation data in a JSON blob inside a
 * <script id="__NEXT_DATA__"> tag. When available this is the most reliable
 * source because it contains the full hierarchy including slugs.
 */
function tryParseNextData(html: string): AlegraDocsIndex | null {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const modules = extractModulesFromNextData(data);
  if (modules.length === 0) return null;

  return {
    fetchedAt: new Date().toISOString(),
    baseUrl: ALEGRA_BASE_URL,
    modules,
  };
}

function extractModulesFromNextData(data: unknown): AlegraModule[] {
  if (!data || typeof data !== "object") return [];

  // ReadMe.io Next.js pageProps may expose categories/nav in several paths;
  // we walk possible locations.
  const candidates = [
    getNestedValue(data, ["props", "pageProps", "categories"]),
    getNestedValue(data, ["props", "pageProps", "navCategories"]),
    getNestedValue(data, ["props", "pageProps", "sidebar", "categories"]),
    getNestedValue(data, ["props", "pageProps", "doc", "categories"]),
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue;

    const modules = mapCategoriesToModules(candidate as unknown[]);
    if (modules.length > 0) return modules;
  }

  return [];
}

function mapCategoriesToModules(categories: unknown[]): AlegraModule[] {
  const modules: AlegraModule[] = [];

  for (const cat of categories) {
    if (!cat || typeof cat !== "object") continue;

    const catObj = cat as Record<string, unknown>;
    const name = String(catObj["title"] ?? catObj["name"] ?? "").trim();
    if (!name) continue;

    const slug = slugify(name);
    const pages = catObj["pages"] ?? catObj["docs"] ?? [];
    const submodules = Array.isArray(pages)
      ? mapPagesToSubmodules(pages as unknown[])
      : [];

    modules.push({ name, slug, submodules });
  }

  return modules;
}

function mapPagesToSubmodules(pages: unknown[]): AlegraSubmodule[] {
  const submodules: AlegraSubmodule[] = [];

  for (const page of pages) {
    if (!page || typeof page !== "object") continue;

    const pageObj = page as Record<string, unknown>;
    const name = String(pageObj["title"] ?? pageObj["name"] ?? "").trim();
    const rawSlug = String(
      pageObj["slug"] ?? pageObj["id"] ?? ""
    ).trim();

    if (!name) continue;

    const slug = rawSlug || slugify(name);
    const url = `${ALEGRA_BASE_URL}/reference/${slug}`;

    submodules.push({ name, slug, url });

    // Some ReadMe.io versions nest child pages under "pages" or "children"
    const children = pageObj["pages"] ?? pageObj["children"];
    if (Array.isArray(children) && children.length > 0) {
      submodules.push(...mapPagesToSubmodules(children as unknown[]));
    }
  }

  return submodules;
}

// ---------------------------------------------------------------------------
// Index parsing — Strategy 2: HTML sidebar regex
// ---------------------------------------------------------------------------

/**
 * Falls back to regex-based extraction from the rendered HTML.
 * Looks for common ReadMe.io sidebar patterns: headings followed by lists.
 */
function parseIndexFromHtml(html: string): AlegraDocsIndex {
  // Strip scripts and styles to avoid false positives
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const modules = extractModulesFromSidebar(cleaned);

  return {
    fetchedAt: new Date().toISOString(),
    baseUrl: ALEGRA_BASE_URL,
    modules,
  };
}

/**
 * Extracts module/submodule hierarchy from the sidebar HTML.
 *
 * Handles two common ReadMe.io patterns:
 *   Pattern A: <h3 class="...">Module</h3> <ul><li><a href="...">Page</a></li></ul>
 *   Pattern B: <span class="sidebar-heading">Module</span> followed by <a> links
 */
function extractModulesFromSidebar(html: string): AlegraModule[] {
  const modules: AlegraModule[] = [];

  // Pattern A: section headings (h2–h5) followed by a list of links
  const sectionPattern =
    /<(?:h[2-5]|div|p)[^>]*>([^<]{2,80})<\/(?:h[2-5]|div|p)>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi;

  for (const match of html.matchAll(sectionPattern)) {
    const heading = decodeHtmlEntities(stripTags(match[1])).trim();
    if (!heading || heading.length < 2) continue;

    const listHtml = match[2];
    const submodules = extractLinksFromList(listHtml);
    if (submodules.length === 0) continue;

    modules.push({
      name: heading,
      slug: slugify(heading),
      submodules,
    });
  }

  // If we got a reasonable result, return it
  if (modules.length > 0) return modules;

  // Pattern B: extract all nav links grouped by nearest heading
  return extractLinksGroupedByHeading(html);
}

function extractLinksFromList(listHtml: string): AlegraSubmodule[] {
  const submodules: AlegraSubmodule[] = [];
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

  for (const match of listHtml.matchAll(linkPattern)) {
    const href = match[1].trim();
    const name = decodeHtmlEntities(match[2]).trim();

    if (!name || !href || href === "#") continue;

    const url = href.startsWith("http") ? href : `${ALEGRA_BASE_URL}${href}`;
    const slug = deriveSlugFromUrl(url);
    submodules.push({ name, url, slug });
  }

  return submodules;
}

function extractLinksGroupedByHeading(html: string): AlegraModule[] {
  const modules: AlegraModule[] = [];

  // Split by h2-h5 headings
  const parts = html.split(/(?=<h[2-5][^>]*>)/i);

  for (const part of parts) {
    const headingMatch = part.match(/<h[2-5][^>]*>([^<]+)<\/h[2-5]>/i);
    if (!headingMatch) continue;

    const heading = decodeHtmlEntities(headingMatch[1]).trim();
    if (!heading || heading.length < 2) continue;

    const submodules = extractLinksFromList(part);
    if (submodules.length === 0) continue;

    modules.push({
      name: heading,
      slug: slugify(heading),
      submodules,
    });
  }

  return modules;
}

// ---------------------------------------------------------------------------
// Endpoint page content extraction
// ---------------------------------------------------------------------------

/**
 * Extracts documentation content from ReadMe.io's embedded server-side JSON.
 *
 * Supports two embedded formats:
 *   - __NEXT_DATA__ (newer Next.js ReadMe.io):
 *       props.pageProps.doc = { title, excerpt, body, api: { method, url, params[], body }, swagger }
 *   - ssr-props (older Hub React App ReadMe.io):
 *       document = { title, api: { method, path, schema: <OpenAPI 3.0 object> } }
 */
function extractContentFromNextData(html: string, pageUrl: string): string | null {
  const data = parseNextDataJson(html);
  if (!data) return null;

  // ssr-props format: top-level "document" key
  const ssrDoc = (data as Record<string, unknown>)["document"];
  if (ssrDoc && typeof ssrDoc === "object") {
    const result = extractContentFromSsrDoc(ssrDoc as Record<string, unknown>, pageUrl);
    if (result) return result;
  }

  // __NEXT_DATA__ format: props.pageProps.doc / page / currentDoc
  const doc =
    getNestedValue(data, ["props", "pageProps", "doc"]) ??
    getNestedValue(data, ["props", "pageProps", "page"]) ??
    getNestedValue(data, ["props", "pageProps", "currentDoc"]);

  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;

  const parts: string[] = [`# Documentación: ${pageUrl}`, ""];

  // --- Title ---
  const title = String(d["title"] ?? "").trim();
  if (title) parts.push(`# ${title}`, "");

  // --- Short description / excerpt ---
  const excerpt = String(d["excerpt"] ?? d["description"] ?? "").trim();
  if (excerpt) parts.push(excerpt, "");

  // --- Prose body (HTML written by the doc author) ---
  const bodyHtml = String(d["body"] ?? d["html"] ?? "").trim();
  if (bodyHtml && bodyHtml !== "undefined") {
    const bodyText = htmlToReadable(bodyHtml).trim();
    if (bodyText) parts.push(bodyText, "");
  }

  // --- API spec block (ReadMe.io custom API spec format) ---
  const api = d["api"];
  if (api && typeof api === "object") {
    const a = api as Record<string, unknown>;
    const method = String(a["method"] ?? "").toUpperCase();
    const url = String(a["url"] ?? "").trim();

    if (method && url) {
      parts.push("## Endpoint", "", `\`${method} ${url}\``, "");
    }

    // Query / path parameters
    const params = a["params"];
    if (Array.isArray(params) && params.length > 0) {
      parts.push("## Parámetros", "");
      for (const param of params) {
        if (!param || typeof param !== "object") continue;
        const p = param as Record<string, unknown>;
        const name = String(p["name"] ?? "").trim();
        if (!name) continue;
        const type = String(
          (p["schema"] as Record<string, unknown> | undefined)?.["type"] ??
            p["type"] ?? ""
        ).trim();
        const required = p["required"] ? " *(requerido)*" : "";
        const desc = String(p["desc"] ?? p["description"] ?? "").trim();
        parts.push(
          `- **${name}**${type ? ` (${type})` : ""}${required}${desc ? `: ${desc}` : ""}`
        );
      }
      parts.push("");
    }

    // Request body schema
    const reqBody = a["body"];
    if (reqBody && typeof reqBody === "object") {
      parts.push("## Cuerpo de la solicitud (Body)", "");
      const rb = reqBody as Record<string, unknown>;
      const schema = (rb["schema"] ?? rb) as Record<string, unknown>;
      const props = schema["properties"];

      if (props && typeof props === "object") {
        const required: string[] = Array.isArray(schema["required"])
          ? (schema["required"] as string[])
          : [];
        for (const [key, val] of Object.entries(
          props as Record<string, unknown>
        )) {
          if (!val || typeof val !== "object") continue;
          const v = val as Record<string, unknown>;
          const type = String(v["type"] ?? "").trim();
          const desc = String(v["description"] ?? v["desc"] ?? "").trim();
          const isReq = required.includes(key) ? " *(requerido)*" : "";
          parts.push(
            `- **${key}**${type ? ` (${type})` : ""}${isReq}${desc ? `: ${desc}` : ""}`
          );
        }
        parts.push("");
      } else {
        // Fallback: dump raw schema as JSON (max 60 lines)
        const raw = JSON.stringify(schema, null, 2);
        const lines = raw.split("\n");
        parts.push(
          "```json",
          lines.slice(0, 60).join("\n"),
          lines.length > 60 ? "// ... (truncado)" : "",
          "```",
          ""
        );
      }
    }

    // Code examples
    const examples = a["examples"];
    if (examples && typeof examples === "object") {
      const ex = examples as Record<string, unknown>;
      const codes = ex["request"] ?? ex["codes"] ?? ex["items"];
      if (Array.isArray(codes)) {
        for (const code of codes.slice(0, 2)) {
          if (!code || typeof code !== "object") continue;
          const c = code as Record<string, unknown>;
          const lang = String(c["language"] ?? c["lang"] ?? "").trim();
          const codeStr = String(c["code"] ?? c["content"] ?? "").trim();
          if (codeStr) {
            parts.push(`\`\`\`${lang}`, codeStr, "```", "");
          }
        }
      }
    }
  }

  // --- OpenAPI / Swagger fragment (alternate format used by some ReadMe pages) ---
  const swagger = d["swagger"] ?? d["openapi"];
  if (swagger && typeof swagger === "object") {
    const sw = swagger as Record<string, unknown>;

    // Parameters (query/path) from OpenAPI fragment
    const swParams = sw["parameters"];
    if (
      Array.isArray(swParams) &&
      swParams.length > 0 &&
      !parts.some((p) => p.startsWith("## Parámetros"))
    ) {
      parts.push("## Parámetros", "");
      for (const param of swParams) {
        if (!param || typeof param !== "object") continue;
        const p = param as Record<string, unknown>;
        const name = String(p["name"] ?? "").trim();
        const inStr = String(p["in"] ?? "").trim();
        const required = p["required"] ? " *(requerido)*" : "";
        const desc = String(p["description"] ?? "").trim();
        const schemaObj = p["schema"] as Record<string, unknown> | undefined;
        const type = schemaObj ? String(schemaObj["type"] ?? "").trim() : "";
        if (name) {
          parts.push(
            `- **${name}**${inStr ? ` [${inStr}]` : ""}${type ? ` (${type})` : ""}${required}${desc ? `: ${desc}` : ""}`
          );
        }
      }
      parts.push("");
    }

    // Request body from OpenAPI fragment
    const swReqBody = getNestedValue(sw, [
      "requestBody",
      "content",
      "application/json",
      "schema",
    ]);
    if (
      swReqBody &&
      typeof swReqBody === "object" &&
      !parts.some((p) => p.startsWith("## Cuerpo de la solicitud"))
    ) {
      parts.push("## Cuerpo de la solicitud (Body)", "");
      const schema = swReqBody as Record<string, unknown>;
      const props = schema["properties"];
      if (props && typeof props === "object") {
        const required: string[] = Array.isArray(schema["required"])
          ? (schema["required"] as string[])
          : [];
        for (const [key, val] of Object.entries(
          props as Record<string, unknown>
        )) {
          if (!val || typeof val !== "object") continue;
          const v = val as Record<string, unknown>;
          const type = String(v["type"] ?? "").trim();
          const desc = String(v["description"] ?? "").trim();
          const isReq = required.includes(key) ? " *(requerido)*" : "";
          parts.push(
            `- **${key}**${type ? ` (${type})` : ""}${isReq}${desc ? `: ${desc}` : ""}`
          );
        }
      } else {
        parts.push("```json", JSON.stringify(swReqBody, null, 2), "```");
      }
      parts.push("");
    }
  }

  const result = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Only return if we got meaningful content beyond just the URL header
  return result.length > 150 ? result : null;
}

/**
 * Extracts content from an ssr-props `document` object (older ReadMe.io Hub format).
 *
 * ssr-props document structure:
 *   document.title          → page title
 *   document.api.method     → HTTP method ("get", "post", etc.)
 *   document.api.path       → endpoint path ("/bank-accounts")
 *   document.api.schema     → OpenAPI 3.0 object (complete spec for this endpoint)
 *
 * The OpenAPI schema usually lives at:
 *   schema.paths["/bank-accounts"]["get"]["parameters"]      → query/path params
 *   schema.paths["/bank-accounts"]["post"]["requestBody"]    → body schema
 *   schema.paths["/bank-accounts"]["post"]["responses"]      → response schema
 */
function extractContentFromSsrDoc(
  doc: Record<string, unknown>,
  pageUrl: string
): string | null {
  const parts: string[] = [`# Documentación: ${pageUrl}`, ""];

  const title = String(doc["title"] ?? "").trim();
  if (title) parts.push(`# ${title}`, "");

  const api = doc["api"];
  if (!api || typeof api !== "object") {
    return parts.join("\n").trim().length > 100 ? parts.join("\n").trim() : null;
  }

  const a = api as Record<string, unknown>;
  const method = String(a["method"] ?? "").toUpperCase();
  const path = String(a["path"] ?? a["url"] ?? "").trim();

  if (method && path) {
    parts.push("## Endpoint", "", `\`${method} ${path}\``, "");
  }

  // OpenAPI 3.0 schema embedded in ssr-props — only extract the CURRENT operation
  const schema = a["schema"];
  if (schema && typeof schema === "object") {
    const s = schema as Record<string, unknown>;
    const paths = s["paths"];

    if (paths && typeof paths === "object") {
      const httpMethod = method.toLowerCase();
      // Filter to the path that matches api.path; fall back to the first path if none matches
      const pathEntries = Object.entries(paths as Record<string, unknown>);
      const targetEntry =
        pathEntries.find(([p]) => p === path) ??
        pathEntries.find(([p]) => path && p.split("{")[0].includes(path.split("{")[0])) ??
        pathEntries[0];

      if (targetEntry) {
        const [, pathVal] = targetEntry;
        if (pathVal && typeof pathVal === "object") {
        const pv = pathVal as Record<string, unknown>;
        // Use api.method; fall back to the first available HTTP method
        const opVal = pv[httpMethod] ?? pv[Object.keys(pv)[0]];
        if (opVal && typeof opVal === "object") {
        const op = opVal as Record<string, unknown>;

        // Parameters (query/path)
        const params = op["parameters"];
        if (Array.isArray(params) && params.length > 0) {
          parts.push("## Parámetros", "");
          for (const param of params) {
            if (!param || typeof param !== "object") continue;
            const p = param as Record<string, unknown>;
            const name = String(p["name"] ?? "").trim();
            const inStr = String(p["in"] ?? "").trim();
            const required = p["required"] ? " *(requerido)*" : "";
            const desc = String(p["description"] ?? "").trim();
            const schemaObj = p["schema"] as Record<string, unknown> | undefined;
            const type = schemaObj ? String(schemaObj["type"] ?? "").trim() : "";
            if (name) {
              parts.push(
                `- **${name}**${inStr ? ` [${inStr}]` : ""}${type ? ` (${type})` : ""}${required}${desc ? `: ${desc}` : ""}`
              );
            }
          }
          parts.push("");
        }

        // Request body
        const reqBodySchema = getNestedValue(op, [
          "requestBody",
          "content",
          "application/json",
          "schema",
        ]);
        if (reqBodySchema && typeof reqBodySchema === "object") {
          parts.push("## Cuerpo de la solicitud (Body)", "");
          const rbs = reqBodySchema as Record<string, unknown>;
          const props = rbs["properties"];
          if (props && typeof props === "object") {
            const required: string[] = Array.isArray(rbs["required"])
              ? (rbs["required"] as string[])
              : [];
            for (const [key, val] of Object.entries(props as Record<string, unknown>)) {
              if (!val || typeof val !== "object") continue;
              const v = val as Record<string, unknown>;
              const type = String(v["type"] ?? "").trim();
              const desc = String(v["description"] ?? "").trim();
              const isReq = required.includes(key) ? " *(requerido)*" : "";
              parts.push(
                `- **${key}**${type ? ` (${type})` : ""}${isReq}${desc ? `: ${desc}` : ""}`
              );
            }
          } else {
            parts.push("```json", JSON.stringify(reqBodySchema, null, 2).slice(0, 2000), "```");
          }
          parts.push("");
        }

        // Responses
        const responses = op["responses"];
        if (responses && typeof responses === "object") {
          parts.push("## Respuestas", "");
          for (const [code, resp] of Object.entries(responses as Record<string, unknown>)) {
            if (!resp || typeof resp !== "object") continue;
            const r = resp as Record<string, unknown>;
            const desc = String(r["description"] ?? "").trim();
            parts.push(`- **${code}**: ${desc}`);
          }
          parts.push("");
        }
        } // end if opVal
        } // end if pathVal
      } // end if targetEntry
    }
  }

  const result = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result.length > 150 ? result : null;
}

/**
 * Extracts content from the rendered HTML (fallback strategy).
 * Less reliable for ReadMe.io API reference pages since most content
 * is JavaScript-rendered.
 */
function extractContentFromHtml(html: string, pageUrl: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  const mainMatch =
    cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    cleaned.match(/<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ??
    cleaned.match(/<div[^>]*class=["'][^"']*rm-Markdown[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (mainMatch) cleaned = mainMatch[1];

  const text = htmlToReadable(cleaned);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const deduped = dedupLines(lines);
  return [`# Documentación: ${pageUrl}`, "", ...deduped].join("\n");
}

/**
 * Extracts documentation content from a ReadMe.io page.
 *
 * Strategy:
 *   1. __NEXT_DATA__ JSON (most complete — includes API spec baked in by SSR)
 *   2. HTML parsing (fallback — only gets static content, misses JS-rendered parts)
 *
 * The __NEXT_DATA__ strategy is preferred because ReadMe.io embeds the full
 * page payload (title, description, body, API params, body schema) into the
 * JSON blob before any client-side JavaScript runs.
 */
export function extractEndpointContent(html: string, pageUrl: string): string {
  const fromNextData = extractContentFromNextData(html, pageUrl);
  if (fromNextData) return fromNextData;
  return extractContentFromHtml(html, pageUrl);
}

/**
 * Lightweight HTML → readable text converter.
 * Not a full converter — targets the patterns used in ReadMe.io docs.
 */
function htmlToReadable(html: string): string {
  return html
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${stripTags(c).trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${stripTags(c).trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${stripTags(c).trim()}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${stripTags(c).trim()}\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${stripTags(c).trim()}\n`)
    // Code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, c) =>
      `\n\`\`\`\n${decodeHtmlEntities(c).trim()}\n\`\`\`\n`
    )
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) =>
      `\`${decodeHtmlEntities(stripTags(c)).trim()}\``
    )
    // Lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `\n- ${stripTags(c).trim()}`)
    // Table cells — basic
    .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, c) => `| ${stripTags(c).trim()} `)
    .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, c) => `| ${stripTags(c).trim()} `)
    .replace(/<tr[^>]*>/gi, "\n")
    // Breaks and paragraphs
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(?:ul|ol|table|thead|tbody|tr)[^>]*>/gi, "\n")
    // Bold / italic
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, c) =>
      `**${stripTags(c).trim()}**`
    )
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, c) =>
      `_${stripTags(c).trim()}_`
    )
    // Links — keep href text
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const label = stripTags(text).trim();
      const resolvedHref = href.startsWith("http") ? href : `${ALEGRA_BASE_URL}${href}`;
      return label ? `[${label}](${resolvedHref})` : resolvedHref;
    })
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .split("\n")
    .map((l) => decodeHtmlEntities(l))
    .join("\n")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------
// Operation links extraction (Level 4: individual HTTP endpoints)
// ---------------------------------------------------------------------------

/**
 * Extracts operation links for a submodule page.
 *
 * The ReadMe.io sidebar renders ALL modules at once, so naive "first UL" logic
 * always picks the wrong module's operations (typically Facturas de venta from
 * Ingresos, which appears first). We avoid that by using __NEXT_DATA__ JSON
 * exclusively — it contains the full category tree with correct parent-child
 * relationships, immune to sidebar ordering.
 *
 * Algorithm:
 *   1. __NEXT_DATA__ doc.children — direct child list on the current doc.
 *   2. __NEXT_DATA__ categories tree — navigate the nav tree to the current
 *      submodule slug and return its child pages.
 *   3. HTML sidebar — only the UL that is a DIRECT SIBLING of the anchor tag
 *      for the current page (not any ancestor module-level UL).
 *
 * ⚠ No final "first UL" fallback — that caused cross-module contamination.
 */
function extractOperationLinks(html: string, pageUrl: string): AlegraOperation[] {
  // Parse __NEXT_DATA__ once and reuse
  const nextData = parseNextDataJson(html);

  // Strategy 1: doc.children in pageProps (direct, most reliable when present)
  if (nextData) {
    const ops = extractOpsFromDocChildren(nextData);
    if (ops.length > 0) return ops;
  }

  // Strategy 2: navigate the categories/sidebar tree
  if (nextData) {
    // 2a: __NEXT_DATA__ categories (newer ReadMe.io format)
    const ops = extractOpsFromCategoryTree(nextData, pageUrl);
    if (ops.length > 0) return ops;

    // 2b: ssr-props sidebar object (older ReadMe.io Hub React App format)
    const ops2 = extractOpsFromSsrSidebar(nextData, pageUrl);
    if (ops2.length > 0) return ops2;
  }

  // Strategy 3: HTML sidebar — only look for a <ul class="subpages"> that is
  // a DIRECT child of the <li> whose <a> href matches the current page path.
  // This avoids picking up module-level ULs that contain the current page as a
  // sibling item (they'd return other submodule names, not operations).
  const opsFromHtml = extractOpsFromNestedSidebarUl(html, pageUrl);
  if (opsFromHtml.length > 0) return opsFromHtml;

  // Return empty rather than picking a random UL (causes wrong operations).
  return [];
}

/**
 * Parses the embedded server-side JSON from a ReadMe.io page.
 *
 * ReadMe.io uses two different embedded formats depending on version:
 *   - Newer (Next.js based): <script id="__NEXT_DATA__" type="application/json">
 *   - Older (Hub React App):  <script id="ssr-props"     type="application/json">
 *
 * Both are tried in order; the first successful parse is returned.
 */
function parseNextDataJson(html: string): unknown | null {
  const patterns = [
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*id=["']ssr-props["'][^>]*>([\s\S]*?)<\/script>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      continue;
    }
  }
  return null;
}

/** Strategy 1: check several known ReadMe.io paths for doc.children. */
function extractOpsFromDocChildren(data: unknown): AlegraOperation[] {
  const candidates = [
    // __NEXT_DATA__ (newer ReadMe.io Next.js format)
    getNestedValue(data, ["props", "pageProps", "doc", "children"]),
    getNestedValue(data, ["props", "pageProps", "page", "children"]),
    getNestedValue(data, ["props", "pageProps", "currentDoc", "children"]),
    getNestedValue(data, ["props", "pageProps", "children"]),
    // ssr-props (older ReadMe.io Hub React App format)
    getNestedValue(data, ["document", "children"]),
    getNestedValue(data, ["document", "pages"]),
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue;
    const ops = mapChildNodesToOps(candidate);
    if (ops.length > 0) return ops;
  }
  return [];
}

/**
 * Strategy 2a: find the current page in the __NEXT_DATA__ categories nav tree,
 * then return its children.
 */
function extractOpsFromCategoryTree(data: unknown, pageUrl: string): AlegraOperation[] {
  const targetSlug = deriveTargetSlug(data, pageUrl, "next");
  if (!targetSlug) return [];

  const categories =
    getNestedValue(data, ["props", "pageProps", "categories"]) ??
    getNestedValue(data, ["props", "pageProps", "navCategories"]) ??
    getNestedValue(data, ["props", "pageProps", "sidebar", "categories"]) ??
    getNestedValue(data, ["props", "pageProps", "doc", "categories"]);

  if (!Array.isArray(categories)) return [];

  const children = findChildrenInTree(categories as unknown[], targetSlug);
  if (!children || children.length === 0) return [];
  return mapChildNodesToOps(children);
}

/**
 * Strategy 2b: navigate the ssr-props `sidebar` object to find the current
 * submodule and return its child operations.
 *
 * ssr-props sidebar structure:
 *   sidebar = {
 *     "0": { title, uri, pages: [ { slug, title, pages: [children] } ] },
 *     "1": { ... },
 *     ...
 *   }
 *
 * Case A — fetching the submodule container page (e.g. "cuentas-de-banco"):
 *   The URL redirects to the FIRST operation page (e.g. "listbankaccounts").
 *   document.slug = "listbankaccounts", document.parent.uri ends with "cuentas-de-banco".
 *   We find "cuentas-de-banco" in sidebar and return its pages.
 *
 * Case B — fetching an individual operation page:
 *   document.slug matches a page under the submodule. We return its siblings.
 */
function extractOpsFromSsrSidebar(data: unknown, pageUrl: string): AlegraOperation[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  const sidebar = d["sidebar"];
  // sidebar can be an Array or a numeric-keyed Object — both work with Object.values()
  if (!sidebar || typeof sidebar !== "object") return [];

  // Derive the target slug from the URL (the submodule's slug, before redirect)
  let urlSlug = "";
  try {
    const pathname = new URL(pageUrl).pathname;
    urlSlug = pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    urlSlug = pageUrl.split("/").filter(Boolean).pop() ?? "";
  }

  // Also look at the document's parent URI (gives us the actual submodule slug
  // even when the page redirected to a different URL)
  const doc = d["document"];
  const parentUri =
    doc && typeof doc === "object"
      ? String(
          ((doc as Record<string, unknown>)["parent"] as Record<string, unknown> | undefined)?.[
            "uri"
          ] ?? ""
        ).trim()
      : "";
  const parentSlug = parentUri ? parentUri.split("/").filter(Boolean).pop() ?? "" : "";

  // Try both: the URL slug (container page) AND the parent slug (when on a child page)
  const slugsToFind = [...new Set([urlSlug, parentSlug].filter(Boolean))];

  for (const slugsToTry of slugsToFind) {
    for (const catVal of Object.values(sidebar)) {
      if (!catVal || typeof catVal !== "object") continue;
      const cat = catVal as Record<string, unknown>;
      const catPages = cat["pages"];
      if (!Array.isArray(catPages)) continue;

      for (const page of catPages) {
        if (!page || typeof page !== "object") continue;
        const p = page as Record<string, unknown>;
        const slug = String(p["slug"] ?? "").trim();

        if (slug === slugsToTry) {
          // Found the container page — return its children as operations
          const children = p["pages"] ?? p["children"];
          if (Array.isArray(children) && children.length > 0) {
            return mapChildNodesToOps(children as unknown[]);
          }
        }
      }
    }
  }

  return [];
}

/**
 * Derives the slug we should search for in the navigation tree.
 * For __NEXT_DATA__ format: uses doc.slug from pageProps.
 * For URL only: extracts the last path segment.
 */
function deriveTargetSlug(
  data: unknown,
  pageUrl: string,
  _format: "next" | "ssr"
): string {
  let urlSlug = "";
  try {
    const pathname = new URL(pageUrl).pathname;
    urlSlug = pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    urlSlug = pageUrl.split("/").filter(Boolean).pop() ?? "";
  }

  const doc =
    getNestedValue(data, ["props", "pageProps", "doc"]) ??
    getNestedValue(data, ["props", "pageProps", "page"]) ??
    getNestedValue(data, ["props", "pageProps", "currentDoc"]);

  const docSlug =
    doc && typeof doc === "object"
      ? String((doc as Record<string, unknown>)["slug"] ?? "").trim()
      : "";

  return docSlug || urlSlug;
}

/**
 * Depth-first search of the nav tree for a page node with the given slug.
 * Returns the node's children/pages array, or null if not found.
 */
function findChildrenInTree(
  nodes: unknown[],
  targetSlug: string
): unknown[] | null {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    const slug = String(n["slug"] ?? "").trim();

    if (slug === targetSlug) {
      const children = n["pages"] ?? n["children"];
      return Array.isArray(children) ? children : [];
    }

    // Recurse into nested pages
    const subPages = n["pages"] ?? n["children"];
    if (Array.isArray(subPages) && subPages.length > 0) {
      const found = findChildrenInTree(subPages as unknown[], targetSlug);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Maps raw category-tree child nodes to AlegraOperation entries. */
function mapChildNodesToOps(children: unknown[]): AlegraOperation[] {
  const ops: AlegraOperation[] = [];
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const c = child as Record<string, unknown>;
    const name = String(c["title"] ?? c["name"] ?? "").trim();
    const slug = String(c["slug"] ?? "").trim();
    if (!name || !slug) continue;
    const url = `${ALEGRA_BASE_URL}/reference/${slug}`;
    ops.push({ name, url, slug });
  }
  return ops;
}

/**
 * Strategy 3 (HTML): look for a <ul class="subpages"> that is a DIRECT child
 * of the <li> element whose <a> href matches the current page path.
 *
 * This specifically avoids picking ancestor/sibling ULs (module-level lists
 * that contain the current page as a sibling item rather than as the parent).
 */
function extractOpsFromNestedSidebarUl(
  html: string,
  pageUrl: string
): AlegraOperation[] {
  let pagePath: string;
  try {
    pagePath = new URL(pageUrl).pathname;
  } catch {
    pagePath = pageUrl;
  }

  // Match a <li> block containing href="CURRENT_PAGE" and a nested subpages UL.
  // We look for <li>...<a href="PAGE_PATH">...<ul class="...subpages...">...</ul>..
  // The regex is intentionally tight to avoid spanning across multiple <li>s.
  const escapedPath = pagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const liPattern = new RegExp(
    `<li[^>]*>[\\s\\S]{0,400}href=["']${escapedPath}["'][\\s\\S]{0,800}<ul[^>]*class="[^"]*subpages[^"]*"[^>]*>([\\s\\S]*?)<\\/ul>[\\s\\S]{0,200}<\\/li>`,
    "i"
  );

  const liMatch = html.match(liPattern);
  if (liMatch) {
    const ops = extractLinksAsOperations(liMatch[1]);
    if (ops.length > 0) return ops;
  }

  return [];
}

/**
 * Extracts operation entries from a subpages <ul> inner HTML (used by Strategy 3).
 *
 * ReadMe.io sidebar link structure:
 *   <a href="/reference/post_bills">
 *     <span class="Sidebar-link-textXxx">
 *       <span class="Sidebar-link-text_labelXxx">Crear una factura de proveedor</span>
 *     </span>
 *     <span class="Sidebar-link-metaXxx">
 *       <span class="rm-APIMethod ...">post</span>   ← HTTP badge, must be excluded
 *     </span>
 *   </a>
 *
 * We prefer the label span so the HTTP method badge ("get", "post", etc.) is
 * never concatenated into the operation name (e.g. "Crear factura de ventapost").
 */
function extractLinksAsOperations(ulHtml: string): AlegraOperation[] {
  const ops: AlegraOperation[] = [];
  const linkPattern = /<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of ulHtml.matchAll(linkPattern)) {
    const href = match[1].trim();
    if (!href || href === "/") continue;

    const innerHtml = match[2];

    // Prefer the stable label span — excludes the HTTP method badge span
    const labelMatch = innerHtml.match(
      /<span[^>]*Sidebar-link-text_label[^"']*["'][^>]*>([^<]+)<\/span>/i
    );

    let name: string;
    if (labelMatch) {
      name = decodeHtmlEntities(labelMatch[1]).trim();
    } else {
      // Fallback: strip all tags then remove trailing HTTP method badge token
      name = decodeHtmlEntities(stripTags(innerHtml))
        .trim()
        .replace(/\s+(get|post|put|del|delete|patch|head|options)$/i, "")
        .trim();
    }

    if (!name) continue;

    const url = href.startsWith("http") ? href : `${ALEGRA_BASE_URL}${href}`;
    const slug = deriveSlugFromUrl(url);

    ops.push({ name, url, slug });
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class AlegraDocsScraper {
  /**
   * Fetches and parses the navigation index from developer.alegra.com.
   * Uses Next.js data extraction first, falls back to HTML regex parsing.
   */
  static async fetchIndex(): Promise<AlegraDocsIndex> {
    const html = await fetchHtml(ALEGRA_BASE_URL);

    // Strategy 1: embedded Next.js data
    const fromNextData = tryParseNextData(html);
    if (fromNextData && fromNextData.modules.length > 0) {
      return fromNextData;
    }

    // Strategy 2: HTML sidebar regex
    const fromHtml = parseIndexFromHtml(html);

    // If still no modules, create a minimal fallback with known sections
    if (fromHtml.modules.length === 0) {
      return buildFallbackIndex();
    }

    return fromHtml;
  }

  /**
   * Fetches a specific documentation page and returns:
   *   - content: cleaned readable text for the page itself
   *   - operations: list of sub-endpoint links found in the ReadMe.io sidebar
   *                 (the rm-Sidebar-list / subpages pattern the user described)
   *
   * If `operations` is non-empty, this page is a "container" page (e.g. Facturas
   * de proveedor) that lists individual HTTP operations (Crear, Listar, etc.).
   * Each operation has its own full documentation page.
   */
  static async fetchEndpointPage(
    url: string
  ): Promise<{ content: string; operations: AlegraOperation[] }> {
    const html = await fetchHtml(url);
    const content = extractEndpointContent(html, url);
    const operations = extractOperationLinks(html, url);
    return { content, operations };
  }

  /**
   * Fetches a specific operation page (e.g. "Crear factura de proveedor").
   * These pages contain the actual HTTP method, path, parameters, and examples.
   */
  static async fetchOperationPage(
    url: string
  ): Promise<{ content: string }> {
    const html = await fetchHtml(url);
    const content = extractEndpointContent(html, url);
    return { content };
  }
}

// ---------------------------------------------------------------------------
// Fallback index
// ---------------------------------------------------------------------------

/**
 * Minimal fallback index based on the known public structure of
 * developer.alegra.com. Used when all scraping strategies fail.
 */
function buildFallbackIndex(): AlegraDocsIndex {
  const base = `${ALEGRA_BASE_URL}/reference`;

  const raw: Array<{ name: string; pages: Array<{ name: string; slug: string }> }> = [
    {
      name: "Información General",
      pages: [
        { name: "Autenticación", slug: "autenticacion" },
        { name: "Límite de request", slug: "limite-de-request" },
      ],
    },
    {
      name: "Ingresos",
      pages: [
        { name: "Facturas de venta", slug: "facturas-de-venta" },
        { name: "Pagos", slug: "pagos" },
        { name: "Notas Crédito", slug: "notas-credito" },
        { name: "Cotizaciones", slug: "cotizaciones" },
        { name: "Remisiones", slug: "remisiones" },
        { name: "Ordenes de venta", slug: "ordenes-de-venta" },
      ],
    },
    {
      name: "Gastos",
      pages: [
        { name: "Facturas de proveedor", slug: "facturas-de-proveedor" },
        { name: "Órdenes de compra", slug: "ordenes-de-compra" },
        { name: "Notas de débito", slug: "notas-de-debito" },
      ],
    },
    {
      name: "Inventario",
      pages: [
        { name: "Ítems", slug: "items" },
        { name: "Bodegas", slug: "bodegas" },
        { name: "Transferencia de bodegas", slug: "transferencia-de-bodegas" },
      ],
    },
    {
      name: "Contactos",
      pages: [
        { name: "Contactos", slug: "contactos" },
        { name: "Adjuntos", slug: "adjuntos" },
      ],
    },
    {
      name: "Vendedores",
      pages: [
        { name: "Crear un vendedor", slug: "crear-un-vendedor" },
        { name: "Consultar todos los vendedores", slug: "consultar-todos-los-vendedores" },
        { name: "Consultar un vendedor", slug: "consultar-un-vendedor" },
      ],
    },
    {
      name: "Contabilidad",
      pages: [
        { name: "Cuentas contables", slug: "cuentas-contables" },
        { name: "Centros de costos", slug: "centros-de-costos" },
        { name: "Comprobantes contables", slug: "comprobantes-contables" },
      ],
    },
    {
      name: "Bancos",
      pages: [
        { name: "Cuentas de banco", slug: "cuentas-de-banco" },
        { name: "Conciliaciones", slug: "conciliaciones" },
      ],
    },
    {
      name: "Configuraciones",
      pages: [
        { name: "Impuestos", slug: "impuestos" },
        { name: "Retenciones", slug: "retenciones" },
        { name: "Monedas", slug: "monedas" },
      ],
    },
    {
      name: "Suscripciones a Webhooks",
      pages: [
        { name: "Descripción general", slug: "descripcion-general" },
        { name: "Crear Suscripción", slug: "crear-suscripcion" },
        { name: "Listar Suscripciones", slug: "listar-suscripciones" },
      ],
    },
    {
      name: "API de cargos adicionales",
      pages: [{ name: "Cargos adicionales : Propina", slug: "cargos-adicionales" }],
    },
  ];

  return {
    fetchedAt: new Date().toISOString(),
    baseUrl: ALEGRA_BASE_URL,
    modules: raw.map((m) => ({
      name: m.name,
      slug: slugify(m.name),
      submodules: m.pages.map((p) => ({
        name: p.name,
        slug: p.slug,
        url: `${base}/${p.slug}`,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveSlugFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? slugify(url);
  } catch {
    return slugify(url);
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    );
}

function dedupLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = l.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getNestedValue(obj: unknown, keys: string[]): unknown {
  let current = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
