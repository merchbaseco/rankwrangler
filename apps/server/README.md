# RankWrangler Server

Fastify + tRPC API for RankWrangler's Amazon SP-API integration, secured with Clerk.

## Production

- **URL:** https://rankwrangler.merchbase.co
- **Health check:** `GET /api/health`

## Local Development

```bash
bun install
cp .env.example .env
# Fill in .env with your credentials (repo root)
docker compose -f apps/server/compose.yml up --build
```

If you prefer running from `apps/server`, pass the env file explicitly:

```bash
docker compose --env-file ../.env up --build
```

The API will be available at `http://localhost:8090/api/health`.

Postgres is bound to `127.0.0.1` on port `5433` for local-only access.

## Scripts

- `bun run build` – bundle the server with Vite
- `bun run start` – run the compiled server
- `bun run cli -- get-product-info --marketplaceId <id> --asin <asin>` – CLI for tRPC
- `./test-api.sh` – smoke test the health endpoint and tRPC call

## Authentication

- **Clerk**: All public endpoints require a Clerk JWT in `Authorization: Bearer <token>`.
- **Admin APIs**: Restrict access by setting `ADMIN_EMAIL`.

Required env vars:

- `CLERK_SECRET_KEY`
- `ADMIN_EMAIL` (optional)

## API

The tRPC router is exposed at `/api`.

Public procedures:

- `public.getProductInfo`
- `public.license.validate`
- `public.license.status`

Admin procedures:

- `admin.license.generate`
- `admin.license.list`
- `admin.license.details`
- `admin.license.delete`
- `admin.license.reset`

Example `curl` (tRPC):

```bash
curl -s -X POST http://localhost:8080/api/public.getProductInfo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_CLERK_TOKEN" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

## Database Migrations

Drizzle migrations live under `./drizzle`. Update the schema in `src/db/schema.ts`, run `bunx drizzle-kit generate`, and commit the generated SQL alongside `init.sql`.

## Deployment

```bash
# Full rebuild and deploy
docker compose up -d --build

# Rebuild specific service
docker compose build --no-cache server
docker compose up -d server

# Just restart (no rebuild)
docker compose up -d
```

Run from `apps/server`, or from the repo root:

```bash
docker compose -f apps/server/compose.yml up -d --build
```

### Service Names

Docker Compose services vs container names:
- `server` → `rankwrangler-server`
- `caddy` → `rankwrangler-caddy`
- `postgres` → `rankwrangler-postgres`

### Checking Health

```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep rankwrangler

# Server logs
docker logs rankwrangler-server --tail 50
```

## Docker Services

- `postgres` – PostgreSQL 15 database
- `server` – Node.js API server
- `caddy` – Reverse proxy (port 8090)
