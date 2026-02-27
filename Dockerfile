# =============================================================================
# Apiary MCP Server — Multi-stage Dockerfile
# =============================================================================
#
# Why multi-stage?
#   better-sqlite3 is a native Node.js addon compiled with node-gyp.
#   Compilation needs build-essential + python3, but the runtime does NOT.
#   We compile in the builder stage, prune dev deps, then copy the
#   pre-compiled node_modules to the runtime — keeping the final image slim.
#
# Volumes (defined at the bottom):
#   /app/.apiary_cache  — Apiary blueprint cache (JSON/APIB files, 24h TTL)
#   /app/.alegra_cache  — Alegra docs SQLite DB + index JSON (5-day TTL)
#
# Platform: linux/amd64 only (better-sqlite3 + apiaryio gem have native code;
# amd64 builds work on Mac M-series via Docker Desktop / Rosetta 2).
# =============================================================================

# ---- Stage 1: Builder -------------------------------------------------------
# Compiles TypeScript + builds native addons (better-sqlite3).
# After build, prunes dev dependencies so only production deps are carried over.
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Build tools required for:
#   better-sqlite3 → node-gyp (C++ compilation)
#   python3        → node-gyp dependency
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
  && rm -rf /var/lib/apt/lists/*

# Install all dependencies (dev + prod) — this compiles better-sqlite3 here
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune devDependencies — leaves only production deps with compiled .node files
RUN npm prune --omit=dev


# ---- Stage 2: Runtime -------------------------------------------------------
# Slim production image.  No build tools needed — better-sqlite3 .node file
# was already compiled in builder and is copied with node_modules below.
# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime

# System runtime deps:
#   ruby / ruby-dev + build-essential  → compile apiaryio gem
#   ca-certificates                    → HTTPS fetches (developer.alegra.com)
#   curl                               → health checks / smoke tests
# After gem install, build-essential + ruby-dev are purged to shrink the image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ruby \
    ruby-dev \
    build-essential \
  && gem install apiaryio --no-document \
  && apt-get purge -y build-essential ruby-dev \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN useradd --system --create-home --shell /usr/sbin/nologin appuser

WORKDIR /app

# Copy package manifest (needed so Node.js can resolve the package)
COPY --chown=appuser:appuser package.json package-lock.json ./

# Copy pre-built app + pre-compiled production node_modules from builder
COPY --from=builder --chown=appuser:appuser /app/build        ./build
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules

# Cache directories
#   .apiary_cache  — Apiary blueprint files (text, JSON)
#   .alegra_cache  — Alegra docs: index JSON + docs.db (SQLite with FTS5)
RUN mkdir -p /app/.apiary_cache /app/.alegra_cache \
  && chown -R appuser:appuser /app/.apiary_cache /app/.alegra_cache

ENV NODE_ENV=production

USER appuser

# Expose cache dirs as volumes so data persists across container restarts
# and can be mounted from the host or a named Docker volume.
VOLUME ["/app/.apiary_cache", "/app/.alegra_cache"]

ENTRYPOINT ["node", "build/index.js"]
