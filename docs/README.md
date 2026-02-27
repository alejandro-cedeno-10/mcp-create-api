# Apiary MCP Server

Servidor Model Context Protocol (MCP) que expone el CLI de Apiary y la API REST como herramientas nativas para agentes compatibles (p. ej. Cursor). Integra cache local con TTL de 24 horas y fallback offline para mantener la productividad cuando Apiary no está disponible. El servidor ofrece dos herramientas:

## Requisitos

- Node.js 20+
- Apiary CLI disponible (incluido en la imagen Docker final) para `fetch`
- API REST de Apiary para `list`
- Clave de Apiary (`APIARY_API_KEY`)

## Configuración local para desarrollo

```bash
cp .env.example .env
edit .env

npm install
npm run build
npm start
```

## Tests

```bash
npm test
```

---

## Docker — Usar la imagen publicada (recomendado)

La imagen está disponible en GitHub Container Registry (GHCR). No necesitas clonar el repositorio ni hacer `build` local.

### Tags disponibles

| Tag | Descripción |
|---|---|
| `latest` | Última versión estable publicada desde `main` |
| `v2` | Major version 2 — incluye soporte de Alegra Docs |

### Crear volúmenes de cache (solo la primera vez)

```bash
docker volume create apiary-cache
docker volume create alegra-cache
```

### Correr con la imagen publicada

```bash
# Con la imagen v2 (recomendado para producción)
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  -v "alegra-cache:/app/.alegra_cache" \
  ghcr.io/alejandro-cedeno-10/mcp-create-api:v2

# Siempre la última versión
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  -v "alegra-cache:/app/.alegra_cache" \
  ghcr.io/alejandro-cedeno-10/mcp-create-api:latest
```

### Configuración MCP (Cursor / Claude Desktop)

Edita tu `mcp.json` con la imagen publicada:

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

> Cambia `v2` por `latest` si prefieres recibir actualizaciones automáticas sin cambiar el config.

---

## Docker — Build local (para desarrollo / contribución)

### Build

```bash
docker build -t apiary-mcp-server:latest .
```

### Run local

```bash
docker run -i --rm \
  -e APIARY_API_KEY="<TU_KEY>" \
  -v "apiary-cache:/app/.apiary_cache" \
  -v "alegra-cache:/app/.alegra_cache" \
  apiary-mcp-server:latest
```

---

## Publicar una nueva versión (mantenedores)

El flujo de CI/CD está en `.github/workflows/docker-publish.yml`.  
Los tags de Docker se generan **automáticamente** desde los tags de Git.

### Pasos para publicar v2.0.0

```bash
# 1. Asegúrate de estar en main con los cambios listos
git checkout main
git pull origin main

# 2. Actualiza la versión en package.json (ya está en 2.0.0)

# 3. Haz commit de todos los cambios pendientes
git add .
git commit -m "chore: release v2.0.0"

# 4. Crea el tag de Git
git tag v2.0.0

# 5. Sube el commit y el tag (el tag dispara el workflow de publicación)
git push origin main
git push origin v2.0.0
```

Tras el push, GitHub Actions construirá y publicará automáticamente los siguientes tags en GHCR:

### Verificar la imagen publicada

```bash
# Ver los tags disponibles en GHCR (requiere autenticación)
docker pull ghcr.io/alejandro-cedeno-10/mcp-create-api:v2

# Smoke test rápido
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' \
  | docker run -i --rm \
      -e APIARY_API_KEY="test-key" \
      ghcr.io/alejandro-cedeno-10/mcp-create-api:v2 \
  | grep '"result"' && echo "OK"
```
