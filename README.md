# Apiary MCP Server

Servidor Model Context Protocol (MCP) que expone el CLI de Apiary y la API REST como herramientas nativas para agentes compatibles (Cursor, Claude Desktop, OpenCode…). Integra cache local con TTL de 24 horas y fallback offline para mantener la productividad cuando Apiary no está disponible.

## Herramientas disponibles

| Tool | Descripción | Requiere |
|---|---|---|
| `list_apiary_apis()` | Lista todos los APIs disponibles en la cuenta de Apiary. | `APIARY_API_KEY` |
| `get_apiary_blueprint_summary(apiName, includeExamples?)` | Resumen compacto del API: endpoints, modelos y estadísticas. ⚡ ~90% menos tokens que el blueprint completo. Ideal para exploración inicial. | `APIARY_API_KEY` |
| `get_apiary_blueprint(apiName, forceRefresh?)` | Especificación completa (API Blueprint / Swagger / OpenAPI). Usa cache local con TTL 24h; `forceRefresh: true` omite el cache. ⚠️ Puede superar 50k tokens. | `APIARY_API_KEY` |
| `generate_api_integration_plan(apiName, language, useCase, testFramework?)` | Genera un plan JSON paso a paso que el LLM del IDE ejecuta para producir código de integración + tests unitarios. Funciona en todos los clientes MCP. | `APIARY_API_KEY` |
| `generate_api_integration(apiName, language, useCase, testFramework?)` | Genera directamente código de integración listo para producción + tests unitarios usando MCP sampling (hereda el LLM del IDE, sin API key extra). Soporta cualquier lenguaje (TypeScript, Python, Java, Go, C#…). | `APIARY_API_KEY` + cliente MCP con sampling |

Tambien se puede usar el tool `alegra_list_modules()` para listar los modulos de Alegra Docs publica.
Tambien se puede usar el tool `alegra_list_submodules(moduleName)` para listar los submodulos de un modulo de Alegra Docs publica.
Tambien se puede usar el tool `alegra_get_endpoint_docs(moduleName, submoduleName, operationName)` para obtener la documentacion de un endpoint de Alegra Docs publica.

La carga de variables `.env` es automática en tiempo de ejecución (gracias a `dotenv`). El servidor crea `.apiary_cache/` en el directorio del proyecto para guardar los contratos y reutilizarlos durante 24h; puedes borrar la carpeta cuando quieras reiniciar el cache.

El servidor dialoga por STDIO y normalmente se ejecuta como subproceso de la herramienta MCP.

## Docker

### 1. Crear volúmenes nombrados para cache (solo la primera vez)

```bash
docker volume create apiary-cache 
docker volume create alegra-cache
```

### 2. Usar la imagen publicada (recomendado)

La imagen está en GitHub Container Registry (GHCR):

```bash
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  -v "alegra-cache:/app/.alegra_cache" \
  ghcr.io/alejandro-cedeno-10/mcp-create-api:latest
```

Tags disponibles: `v2` o `latest`

V2 es la version actual  que soporta Alegra Docs publica.
Latest es la version actual que soporta solo documentacion en apiary.

### 3. Build local (solo para desarrollo)

```bash

docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  -v "alegra-cache:/app/.alegra_cache" \
  ghcr.io/alejandro-cedeno-10/mcp-create-api:v2
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
        "apiary-cache:/app/.apiary_cache",
        "-v",
        "alegra-cache:/app/.alegra_cache",
        "ghcr.io/alejandro-cedeno-10/mcp-create-api:v2"
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
| **Token Optimization** | El resumen compacto del blueprint extrae solo lo relevante (~90% menos tokens), ideal para la fase de exploración antes de bajar la spec completa. |