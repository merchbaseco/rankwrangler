# syntax=docker/dockerfile:1.6

#
# NOTE: This Dockerfile is built with the *repo root* as the build context
# (see apps/server/compose.yml). This is required so Bun workspaces like
# packages/http-client resolve during `bun install`.
#

FROM oven/bun:1.1.27 AS deps
WORKDIR /app

# Copy only the workspace manifests first for better layer caching.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY packages/http-client/package.json packages/http-client/package.json

RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .

# Build only the server workspace.
RUN bun run --filter @rankwrangler/server build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

# Node modules from Bun install (includes workspace links).
COPY --from=deps /app/node_modules ./node_modules

# Minimal runtime artifacts from the server workspace.
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/drizzle ./drizzle

USER nodejs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(res=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
