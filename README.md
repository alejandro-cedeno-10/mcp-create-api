# Apiary MCP Server

Servidor Model Context Protocol (MCP) que expone el CLI de Apiary y la API REST como herramientas nativas para agentes compatibles (p. ej. Cursor). Integra cache local con TTL de 24 horas y fallback offline para mantener la productividad cuando Apiary no está disponible. El servidor ofrece dos herramientas:

- `get_apiary_blueprint(apiName, forceRefresh?)`: recupera la especificación API Blueprint/Swagger de un API concreto. Usa cache en `.apiary_cache/` (TTL 24h) y permite `forceRefresh` para saltarse el cache.
- `list_apiary_apis()`: lista todos los APIs disponibles para la cuenta asociada a la clave de Apiary usando la API REST.

## Requisitos

- Node.js 20+
- Apiary CLI disponible (incluido en la imagen Docker final) para `fetch`
- API REST de Apiary para `list` 
- Clave de Apiary (`APIARY_API_KEY`)

## Configuración local

```bash
cp .env.example .env
edit .env # Añade tu APIARY_API_KEY y valores opcionales

npm install
npm run build
npm start
```

La carga de variables `.env` es automática en tiempo de ejecución (gracias a `dotenv`). El servidor crea `.apiary_cache/` en el directorio del proyecto para guardar los contratos y reutilizarlos durante 24h; puedes borrar la carpeta cuando quieras reiniciar el cache.

El servidor dialoga por STDIO y normalmente se ejecuta como subproceso de la herramienta MCP.

## Tests

```bash
npm test
```

## Docker

### Crear volumen nombrado (recomendado)

```bash
docker volume create apiary-cache
```

### Build y run

```bash
docker build -t apiary-mcp-server:latest .
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  apiary-mcp
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
        "apiary-mcp-server:latest"
      ]
    }
  }
}
```

### Reinicia completamente.