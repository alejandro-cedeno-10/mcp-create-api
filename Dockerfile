# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.json
COPY src ./src

RUN npm run build

# ---- Production Stage ----
FROM node:20-slim AS runtime

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

RUN useradd --system --create-home --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY --chown=appuser:appuser package.json package-lock.json ./
COPY --from=builder --chown=appuser:appuser /app/build ./build

RUN npm ci --omit=dev \
  && npm cache clean --force \
  && chown -R appuser:appuser /app

RUN mkdir -p /app/.apiary_cache \
  && chown -R appuser:appuser /app/.apiary_cache

# LLM provider for the integration agent (defaults to anthropic)
# Pass the matching key via docker run -e or mcp.json env block
ENV NODE_ENV=production \
    LLM_PROVIDER=anthropic

USER appuser

ENTRYPOINT ["node", "build/index.js"]
