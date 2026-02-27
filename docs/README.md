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

---

## Arquitectura de recuperación de información (RAG)

Este servidor implementa un conjunto de técnicas formales de recuperación de información para que el LLM reciba contexto real de la documentación en lugar de depender de su entrenamiento.

### 1. RAG — Retrieval-Augmented Generation

Patrón principal del servidor. El MCP tool actúa de retriever: el usuario pregunta → el tool busca en los docs → devuelve solo las secciones relevantes → el LLM responde con contexto real, sin alucinar.

### 2. Structure-Aware Chunking (Chunked RAG)

Los documentos se dividen en secciones por encabezados H2/H3, no por tamaño fijo de caracteres. Las secciones menores a 80 caracteres se fusionan con la anterior; las mayores a 2500 se parten en párrafos. Objetivo: ~500 tokens por chunk.

### 3. BM25 — Best Match 25

Algoritmo de ranking que SQLite FTS5 aplica automáticamente al ordenar por `rank`. Cada sección se puntúa por relevancia léxica frente a la query del usuario y se devuelven las top N.

### 4. Semantic RAG — Embeddings + Cosine Similarity

Embeddings locales con el modelo `all-MiniLM-L6-v2` (384 dimensiones, ONNX, sin API key). Cada sección se vectoriza y se almacena en SQLite. La similitud coseno permite encontrar secciones semánticamente relacionadas aunque no compartan palabras exactas con la query.

### 5. Hybrid Search con RRF — Reciprocal Rank Fusion

Fusión de BM25 (FTS5) y similitud coseno usando el algoritmo RRF estándar (K=60). BM25 es preciso en terminología exacta; cosine captura sinónimos y variantes de idioma. RRF combina ambas listas de ranking sin necesidad de normalizar espacios de puntuación distintos.

### 6. Hierarchical / Cascading Indexing

Indexación en 4 niveles de granularidad progresiva (lazy evaluation): solo se profundiza al nivel siguiente cuando el usuario lo necesita.

| Nivel | Contenido | Storage |
|---|---|---|
| 1 | Módulos | JSON, TTL 5 días |
| 2 | Submódulos | mismo JSON, gratis |
| 3 | Operaciones | SQLite, detectadas del sidebar |
| 4 | Secciones FTS | SQLite `docs.db`, on-demand |

### 7. Token Budget Management

`estimateTokens()` calcula tokens aproximados (4 chars ≈ 1 token). Sin query se devuelven hasta 4 secciones; con query solo 3. El header de cada respuesta incluye el conteo para que el modelo sepa cuánto contexto recibió.

### 8. Cache-aside Pattern con TTL

| Cache | TTL |
|---|---|
| `alegra_docs_index.json` — índice de módulos | 5 días |
| `docs.db` — secciones por página | 5 días |
| `.apiary_cache/*.apib` — blueprints Apiary | 24 horas |

Si el cache existe y el TTL es válido, no se hace ninguna llamada HTTP. Si expiró: fetch → chunk → store → responder.

### 9. ETL on-demand

Extract → Transform → Load disparado solo cuando el usuario solicita un endpoint no cacheado.

| Fase | Implementación |
|---|---|
| Extract | `fetchEndpointPage()` → HTML crudo |
| Transform | `htmlToReadable()` + `splitIntoSections()` |
| Load | `storePage()` → SQLite FTS5 + vector table |

A diferencia de herramientas como CocoIndex (batch + incremental), aquí el ETL es lazy: solo indexa lo que se consulta.

### Nombre formal del sistema

> **Hybrid RAG with Structure-Aware Chunking, Hierarchical Lazy Indexing, BM25 + Semantic Retrieval fused via Reciprocal Rank Fusion, and Token Budget Management**
