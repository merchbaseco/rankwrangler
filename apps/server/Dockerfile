# syntax=docker/dockerfile:1.6

# Base image with Node and corepack enabled for Yarn Berry workspaces.
FROM node:20-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache libc6-compat && corepack enable

# Install all dependencies with workspace awareness.
FROM base AS dependencies
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY .yarn ./.yarn
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/safari-extension/package.json ./apps/safari-extension/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/web-extension/package.json ./packages/web-extension/package.json
RUN yarn install --immutable

# Build the server application.
FROM dependencies AS build
COPY . .
RUN yarn build:server

# Trim dependencies down to just what the server needs at runtime.
FROM dependencies AS production-deps
RUN yarn workspaces focus @rankwrangler/server --production

# Final runtime image.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache dumb-init && corepack enable \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

# Copy the focused workspace (dependencies + package manifests).
COPY --from=production-deps /app/package.json ./package.json
COPY --from=production-deps /app/yarn.lock ./yarn.lock
COPY --from=production-deps /app/.yarn ./.yarn
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps ./apps

# Copy the compiled application and database migrations.
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle

USER nodejs
WORKDIR /app/apps/server

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(res=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
