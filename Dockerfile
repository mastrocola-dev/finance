FROM ghcr.io/astral-sh/uv:0.11.32 AS uv

FROM node:24-slim AS modules
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
RUN npm ci --omit=dev --workspaces=false --ignore-scripts && npm cache clean --force

FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root=false --ignore-scripts && npm cache clean --force
COPY web/index.html web/vite.config.ts web/tsconfig.json web/
COPY web/public web/public
COPY web/src web/src
RUN VITE_AUTH_MODE=entra npm run build -w web

FROM node:24-slim AS ingest
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON=3.13 \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_PROJECT_ENVIRONMENT=/app/ingest/.venv-runtime \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1
WORKDIR /app/ingest
COPY ingest/pyproject.toml ingest/uv.lock ./
RUN uv sync --no-dev --exact --locked
COPY ingest/ingest ingest
COPY ingest/serve.py ./

FROM node:24-slim AS base
ENV NODE_ENV=production
WORKDIR /app
COPY --from=modules /app/node_modules node_modules
COPY package.json openapi.json ./
COPY db db
COPY src src

FROM base AS mcp
ENV MCP_HOST=0.0.0.0 \
    MCP_PORT=3100
USER node
EXPOSE 3100
CMD ["node", "src/mcp/http.ts"]

FROM base AS api
COPY --from=uv /uv /usr/local/bin/uv
COPY --from=ingest /opt/python /opt/python
COPY --from=ingest /app/ingest ingest
COPY agents agents
COPY --from=web /app/web/dist web/dist
RUN mkdir /app/.imports && chown node:node /app/.imports
ENV API_HOST=0.0.0.0 \
    API_PORT=3200 \
    IMPORT_UPLOADS=/app/.imports \
    WEB_ROOT=/app/web/dist \
    UV_PROJECT_ENVIRONMENT=/app/ingest/.venv-runtime \
    UV_PYTHON_DOWNLOADS=never \
    UV_OFFLINE=1
USER node
EXPOSE 3200
CMD ["node", "src/http/api.ts"]
