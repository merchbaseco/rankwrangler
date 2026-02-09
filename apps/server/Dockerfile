# syntax=docker/dockerfile:1.6

FROM oven/bun:1.1.27 AS deps
WORKDIR /app
COPY package.json ./
RUN bun install

FROM deps AS build
COPY . .
RUN bun run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER nodejs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(res=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
