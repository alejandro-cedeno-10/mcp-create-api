# Apiary MCP Server

Servidor Model Context Protocol (MCP) que expone el CLI de Apiary y la API REST como herramientas nativas para agentes compatibles (Cursor, Claude Desktop, OpenCode…). Integra cache local con TTL de 24 horas y fallback offline para mantener la productividad cuando Apiary no está disponible.

## Herramientas disponibles

| Tool | Descripción | Requiere |
|---|---|---|
| `list_apiary_apis()` | Lista todos los APIs disponibles en la cuenta de Apiary. | `APIARY_API_KEY` |
| `get_apiary_blueprint_summary(apiName, includeExamples?)` | Resumen compacto del API: endpoints, modelos y estadísticas. ⚡ ~90% menos tokens que el blueprint completo. Ideal para exploración inicial. | `APIARY_API_KEY` |
| `get_apiary_blueprint(apiName, forceRefresh?)` | Especificación completa (API Blueprint / Swagger / OpenAPI). Usa cache local con TTL 24h; `forceRefresh: true` omite el cache. ⚠️ Puede superar 50k tokens. | `APIARY_API_KEY` |
| `search_apiary_blueprint(apiName, query?, maxSections?)` | **RAG:** Busca en el blueprint por palabras clave y devuelve solo las secciones relevantes (3–5 chunks). Ahorra tokens vs. cargar el blueprint completo. | `APIARY_API_KEY` |
| `generate_api_integration_plan(apiName, language, useCase, testFramework?)` | Genera un plan JSON paso a paso que el LLM del IDE ejecuta para producir código de integración + tests unitarios. Funciona en todos los clientes MCP. | `APIARY_API_KEY` |
| `generate_api_integration(apiName, language, useCase, testFramework?)` | Genera directamente código de integración listo para producción + tests unitarios usando MCP sampling (hereda el LLM del IDE, sin API key extra). Soporta cualquier lenguaje (TypeScript, Python, Java, Go, C#…). | `APIARY_API_KEY` + cliente MCP con sampling |

**Documentación genérica (cualquier sitio):** Registra un sitio por URL base y consulta por secciones, con indexación lazy y búsqueda FTS para ahorrar tokens.

| Tool | Descripción |
|---|---|
| `docs_register_source(baseUrl, name?)` | Registra un sitio de documentación por su URL base. Obtiene el índice de páginas (__NEXT_DATA__ o enlaces same-origin). |
| `docs_list_pages(sourceId, forceRefresh?)` | Lista las páginas/secciones del sitio registrado. Usa el `path` devuelto en `docs_get_page`. |
| `docs_get_page(sourceId, pagePathOrUrl, query?, maxSections?)` | Obtiene una página: la descarga, trocea por H2/H3, indexa en SQLite FTS5 y devuelve solo las secciones relevantes (o búsqueda por `query`). Indexación lazy (solo lo que se pide). TTL 5 días. |

La carga de variables `.env` es automática en tiempo de ejecución (gracias a `dotenv`). El servidor crea `.apiary_cache/` (blueprints + índice RAG) y `.docs_cache/` (docs genéricas) en el directorio del proyecto; puedes borrarlos cuando quieras reiniciar la caché.

El servidor dialoga por STDIO y normalmente se ejecuta como subproceso de la herramienta MCP.

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

## Integración del mcp

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


### Reinicia completamente.

## Prácticas de ingeniería aplicadas

| Práctica | Descripción |
|---|---|
| **Tool Caching (TTL 24 h)** | Los blueprints se guardan en disco y se reutilizan durante 24 h. Evita llamadas repetidas a Apiary y permite trabajar offline. |
| **MCP Sampling** | El servidor no necesita una API key de LLM propia. Envía `sampling/createMessage` al cliente y este responde con su modelo. SOLO para clientes MCP que implementen sampling/createMessage. |
| **Prompt Chaining** | El flujo de generación es un agente de 3 pasos secuenciales: (1) cargar el blueprint, (2) generar el código, (3) generar los tests usando el código del paso anterior como contexto. El output de cada paso es el input del siguiente. |
| **MCP Prompts (templates)** | Dos prompts MCP formales registrados en el servidor — `generate_integration_code` y `generate_integration_tests` — con system prompt, user prompt y placeholders tipados. El llm del IDE puede invocarlos directamente sin sampling. |
| **Graceful Degradation (3 niveles)** | Si sampling falla, el servidor intenta un segundo camino; si vuelve a fallar, devuelve el plan JSON para que el llm del IDE ejecute él mismo. Ningún cliente se queda sin respuesta. |
| **Token Optimization** | El resumen compacto del blueprint extrae solo lo relevante (~90% menos tokens). **RAG sobre blueprints:** `search_apiary_blueprint` indexa el spec por secciones (chunking por endpoints/schemas) y devuelve solo los chunks relevantes a la query (BM25/FTS5), reduciendo drásticamente tokens. |