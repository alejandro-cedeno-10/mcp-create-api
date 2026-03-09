# Apiary MCP Server — Documentación técnica

## Herramientas (solo Apiary)

- `list_apiary_apis` — Lista APIs de la cuenta.
- `get_apiary_blueprint(apiName, forceRefresh?)` — Blueprint completo (cache 24h).
- `get_apiary_blueprint_summary(apiName, includeExamples?)` — Resumen compacto (~90% menos tokens).
- `search_apiary_blueprint(apiName, query?, maxSections?, forceRefresh?)` — RAG: búsqueda por keywords, devuelve solo secciones relevantes.
- `generate_api_integration` / `generate_api_integration_plan` — Generación de código + tests.

---

## Prácticas aplicadas: Chunked RAG, Structure-Aware Chunking, BM25, Token Budget

Sí se aplican en el flujo de `search_apiary_blueprint`:

| Práctica | Estado | Dónde |
|----------|--------|--------|
| **Chunked RAG** | ✅ Activo | El blueprint se sirve por chunks (secciones), no entero. |
| **Structure-Aware Chunking** | ✅ Activo | `blueprintChunker.ts`: cortes por `#`/`##`/`###` (API Blueprint) o por path+method y schema (OpenAPI); merge de secciones &lt;80 chars; split por párrafos si &gt;2500 chars. Objetivo ~500 tokens/chunk. |
| **BM25 Keyword Retrieval** | ✅ Activo | `apiaryBlueprintIndex.ts`: FTS5 con `MATCH` y `ORDER BY rank` (BM25 de SQLite). |
| **Embeddings + búsqueda híbrida** | ✅ Activo | `embedder.ts`: modelo local **Xenova/all-MiniLM-L6-v2** (384 dims, sin API key). Tras indexar se calculan embeddings por sección en segundo plano; la búsqueda combina BM25 y similitud coseno con **RRF** (Reciprocal Rank Fusion). Si aún no hay embeddings, solo BM25. |
| **Token Budget Management** | ✅ Activo | `estimateTokens()` (4 chars ≈ 1 token). Límite por secciones (`maxSections`) y **tope por tokens** en respuesta: `trimSectionsToTokenBudget(sections, 2000)` para no pasar ~2000 tokens al modelo. Header con `~N tokens`. |
| **Lazy Indexing** | ✅ Activo | El índice se crea **on-demand**: al primer uso de `search_apiary_blueprint` para un `apiName` se hace fetch → chunk → load en SQLite. No hay jerarquía de niveles (eso era para docs con módulos/submódulos); aquí es un solo nivel: un blueprint → N secciones. |

En conjunto: **Chunked RAG with Structure-Aware Chunking, BM25 Keyword Retrieval, and Token Budget Management**, con indexación lazy (un nivel por blueprint).

---

## Cómo se guarda el RAG en la BD

Es un **ETL on-demand** (se ejecuta cuando hace falta), sin algoritmo de referencia externo:

1. **E (Extract)**  
   Se obtiene el blueprint en texto (desde cache en disco `.apiary_cache/<apiName>.apib` o desde el CLI de Apiary si no hay cache o `forceRefresh`).

2. **T (Transform)**  
   El texto **no se guarda plano**. Se aplica un algoritmo antes de insertar:
   - **Chunking por estructura** en `blueprintChunker.ts`: cortes por `#`/`##`/`###` (API Blueprint) o por path+method y schema (OpenAPI); merge de secciones &lt;80 chars; split por párrafos si &gt;2500 chars (~500 tokens/chunk).
   - **Normalización**: cada chunk se pasa por `normalizeContent()` (colapsar espacios/líneas en blanco, trim) para reducir ruido y tokens antes de guardar.
   - **Límite de tokens al recuperar**: `trimSectionsToTokenBudget()` recorta la lista de secciones para no superar ~2000 tokens en la respuesta, porque los modelos leen por tokens.

3. **L (Load)**  
   En `apiaryBlueprintIndex.ts` se guarda en SQLite (`.apiary_cache/blueprints.db`):
   - **Tabla `apiary_blueprints`:** una fila por API (`api_name`, `fetched_at`).
   - **Tabla `apiary_blueprint_sections`:** una fila por chunk (`blueprint_id`, `title`, `content`, `position`).
   - **Tabla virtual FTS5** `apiary_blueprint_sections_fts`: índice full-text sobre `title` y `content`, mantenido con triggers en INSERT/UPDATE/DELETE.
   - **Tabla `apiary_blueprint_sections_emb`** (opcional): embeddings por sección (BLOB 384×4 bytes) con **Xenova/all-MiniLM-L6-v2** (`@xenova/transformers`). Se rellenan en **segundo plano** tras cada indexación para no bloquear la respuesta.

4. **Recuperación**  
   No se usa un “algoritmo de referencia” aparte para el texto: la búsqueda es **BM25** (FTS5).  
   Si existen embeddings para ese blueprint, se hace **búsqueda híbrida**: BM25 (top 2×limit) + similitud coseno del embedding de la query con cada sección; se fusionan rankings con **RRF** (Reciprocal Rank Fusion) y se devuelven las top `limit` secciones.  
   Con `query` y sin embeddings, solo BM25.  
   Sin `query` se devuelven las primeras N secciones por `position`.  
   El resultado son solo los chunks relevantes (p. ej. 3–5), no el blueprint entero.

**Resumen:** ETL on-demand (blueprint → chunk por estructura → INSERT en SQLite) + FTS5 (BM25). Opcionalmente embeddings locales (Xenova/all-MiniLM-L6-v2) en segundo plano para búsqueda híbrida BM25 + vector con RRF.

---

## Docker

Un solo volumen: `apiary-cache` → `/app/.apiary_cache` (archivos .apib + `blueprints.db`).

Ver README en la raíz para crear el volumen y ejemplo de `mcp.json`.
