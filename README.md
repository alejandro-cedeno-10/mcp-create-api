# Apiary MCP Server

Servidor Model Context Protocol (MCP) que expone el CLI de Apiary y la API REST como herramientas nativas para agentes compatibles (Cursor, Claude Desktop, OpenCode…). Incluye cache local con TTL de 24 horas, índice RAG con chunking por estructura (OpenAPI/API Blueprint), búsqueda BM25 + embeddings opcionales y control de tokens. Fallback offline cuando Apiary no está disponible.

## Herramientas disponibles

| Tool | Descripción | Requiere |
|------|-------------|----------|
| `list_apiary_apis()` | Lista todos los APIs disponibles en la cuenta de Apiary (nombres y subdominios). | `APIARY_API_KEY` |
| `get_apiary_blueprint(apiName, forceRefresh?)` | Especificación completa (API Blueprint / Swagger / OpenAPI). Cache local TTL 24h; `forceRefresh: true` omite el cache. ⚠️ Puede superar 50k tokens. | `APIARY_API_KEY` |
| `get_apiary_blueprint_summary(apiName, includeExamples?)` | Resumen compacto: endpoints por método, modelos y estadísticas. ⚡ ~90% menos tokens que el blueprint completo. Ideal para exploración inicial. | `APIARY_API_KEY` |
| `get_apiary_blueprint_overview(apiName, maxSections?, maxTokens?, forceRefresh?)` | Resumen desde el **índice**: reutiliza las secciones ya chunkeadas (y opcionalmente embebidas). Sin re-parsear el spec; control con `maxSections` (1–20, default 10) y `maxTokens` (400–4000, default 2000). Usar después de traer el blueprint o de buscar. | `APIARY_API_KEY` |
| `search_apiary_blueprint(apiName, query?, maxSections?, forceRefresh?)` | **RAG:** búsqueda por palabras clave; devuelve solo las secciones relevantes (structure-aware chunking, BM25/FTS5, opcional híbrido con embeddings y RRF). `maxSections` 1–15 (default 5). Recorte por presupuesto de tokens. | `APIARY_API_KEY` |
| `generate_api_integration_plan(apiName, language, useCase, testFramework?)` | Genera un plan JSON paso a paso que el LLM del IDE ejecuta para producir código de integración + tests unitarios. Funciona en todos los clientes MCP. | `APIARY_API_KEY` |
| `generate_api_integration(apiName, language, useCase, testFramework?)` | Genera directamente código de integración + tests unitarios usando MCP sampling (hereda el LLM del IDE, sin API key extra). Soporta varios lenguajes (TypeScript, Python, Java, Go, C#, etc.). | `APIARY_API_KEY` + cliente MCP con sampling |

El servidor crea `.apiary_cache/` (blueprints + índice RAG en SQLite) en el directorio del proyecto; puedes borrarlo para reiniciar la caché.

El servidor dialoga por STDIO y se ejecuta como subproceso del cliente MCP.

## Docker

### 1. Crear volúmenes nombrados para cache (solo la primera vez)

```bash
docker volume create raia-apiary-cache
```

### 2. Usar la imagen publicada (recomendado)

La imagen está en GitHub Container Registry (GHCR):

```bash
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "raia-apiary-cache:/app/.apiary_cache" \
  ghcr.io/alejandro-cedeno-10/mcp-raia-api:latest
```

### 3. Build local (solo para desarrollo)

```bash
docker build -t mcp-raia-api:latest .
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "raia-apiary-cache:/app/.apiary_cache" \
  mcp-raia-api:latest
```

---

## Integración del MCP

### Edita tu archivo `mcp.json`:

```json
{
  "mcpServers": {
    "apiary": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "APIARY_API_KEY=${env:APIARY_API_KEY}",
        "-v",
        "raia-apiary-cache:/app/.apiary_cache",
        "ghcr.io/alejandro-cedeno-10/mcp-raia-api:latest"
      ]
    }
  }
}
```

Reinicia por completo el cliente MCP después de cambiar la configuración.

## Prácticas de ingeniería aplicadas

| Práctica | Descripción |
|----------|-------------|
| **Cache de blueprints (TTL 24 h)** | Los blueprints se guardan en disco y se reutilizan 24 h. Menos llamadas a Apiary y uso offline con fallback a cache expirado si falla la red. |
| **Chunked RAG con structure-aware chunking** | El blueprint se trocea por secciones lógicas: en OpenAPI por path+method y por schema en `components/schemas`; en API Blueprint por `#`, `##`, `###`. Solo `search_apiary_blueprint` usa este índice para recuperación. |
| **Indexación lazy** | El índice (chunks + FTS5 + embeddings opcionales) se crea la primera vez que se busca o se pide overview para ese API; no se pre-indexan todos los blueprints. |
| **BM25 (FTS5) + búsqueda híbrida** | Búsqueda por palabras clave con SQLite FTS5. Si existen embeddings (Xenova/all-MiniLM-L6-v2, en background), se combina BM25 y similitud vectorial con RRF (Reciprocal Rank Fusion). |
| **Token budget management** | Límites configurables: `maxSections`, `maxTokens` en search y overview; recorte de secciones para no exceder el presupuesto de tokens devuelto al modelo. |
| **Overview desde índice** | `get_apiary_blueprint_overview` reutiliza las mismas secciones indexadas (chunked/embedded) que la búsqueda, para dar un resumen sin volver a parsear el spec completo. |
| **Prompt chaining** | Flujo de generación en 3 pasos: (1) cargar blueprint, (2) generar código, (3) generar tests con el código como contexto. La salida de cada paso es la entrada del siguiente. |
| **MCP Sampling** | El servidor no usa API key de LLM propia: envía `sampling/createMessage` al cliente, que responde con su modelo. Solo en clientes que implementen sampling. |
| **MCP Prompts (templates)** | Prompts registrados: `generate_integration_code` y `generate_integration_tests`, con system/user y placeholders. El LLM del IDE puede invocarlos sin sampling. |
| **Graceful degradation** | Si sampling no está disponible, se puede ejecutar el plan vía sampling con plantillas; si tampoco, se devuelve el plan JSON para que el IDE lo ejecute paso a paso. |
