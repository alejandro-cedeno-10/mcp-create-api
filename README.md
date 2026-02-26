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

La carga de variables `.env` es automática en tiempo de ejecución (gracias a `dotenv`). El servidor crea `.apiary_cache/` en el directorio del proyecto para guardar los contratos y reutilizarlos durante 24h; puedes borrar la carpeta cuando quieras reiniciar el cache.

El servidor dialoga por STDIO y normalmente se ejecuta como subproceso de la herramienta MCP.

## Docker

### Crear volumen nombrado (recomendado) para cache

```bash
docker volume create apiary-cache
```

### Build y run

```bash
docker build -t ghcr.io/alejandro-cedeno-10/mcp-create-api:latest .
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  ghcr.io/alejandro-cedeno-10/mcp-create-api:latest
```

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
        "ghcr.io/alejandro-cedeno-10/mcp-create-api:latest"
      ]
    }
  }
}
```

### Reinicia completamente.