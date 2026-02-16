# RankWrangler Server

Fastify + tRPC API for RankWrangler's Amazon SP-API integration.

## Production

- **URL:** https://rankwrangler.merchbase.co
- **Health check:** `GET /api/health`
- **Website:** `GET /` (served by the stack's Caddy container)

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
The website will be available at `http://localhost:8090/`.

Postgres is bound to `127.0.0.1` on port `5433` for local-only access.

### Dev (no Docker)

If you want to run the server directly (without the Docker stack), make sure your
database points at localhost:

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5433
```

If you're using the Docker Postgres container but running the server locally,
the `5433` host port is already mapped for you.

## Scripts

- `bun run build` – bundle the server with Vite
- `bun run start` – run the compiled server
- `bun run cli -- products get <ASIN...> --marketplace <id>` – product lookup (single or multi-ASIN)
- `bun run cli -- license status` – show current license usage/limit snapshot
- `bun run cli -- config set api-key <value>` – configure CLI defaults locally
- `./test-api.sh` – smoke test health, public API (license), and app API (Clerk)

## Authentication

- **Public API**: License key in `Authorization: Bearer <licenseKey>`.
- **App API**: Clerk JWT in `Authorization: Bearer <token>`.
- **Admin APIs**: Restrict access by setting `ADMIN_EMAIL`.

Required env vars:

- `CLERK_SECRET_KEY`
- `LICENSE_SECRET`
- `ADMIN_EMAIL` (optional)

## API Structure

tRPC router is exposed at `/api` with explicit namespaces:

- `api.public.*` – public API (license key auth)
- `api.app.*` – app/admin API (Clerk auth)

### Typed Client

- The public API is also exposed via the typed client in `packages/http-client`.
- When the public router changes, regenerate types with:
  - `bun run http-client:types`
  - `bun run http-client:build`
- npm publish workflow is documented in `docs/http-client-spec.md`.

### CLI Shape

- CLI is resource-first, verb-second (for example `products get`, `license status`).
- CLI output is JSON-only and uses a standard envelope:
  - Success: `{"ok": true, "data": ...}`
  - Error: `{"ok": false, "error": {"code": "...", "message": "..."}}`
- CLI command surface maps directly to the public API surface (`api.public.*`).
- `products get` accepts one or many ASINs; CLI hides single vs batch endpoint choice.
- Local CLI config is stored at `~/.rankwrangler/config.json`.
- Product commands use default marketplace `ATVPDKIKX0DER` unless overridden by `--marketplace` / `-m`.
- CLI spec: `docs/cli-spec.md`.

### Router Layout

- Each tRPC procedure lives in its own file under:
  - `apps/server/src/api/public`
  - `apps/server/src/api/app`
- Router files (`router.ts`) should only compose these procedures.

Public procedures:

- `api.public.getProductInfo`
- `api.public.getProductInfoBatch`
- `api.public.license.validate`
- `api.public.license.status`

App procedures:

- `api.app.getProductInfo`
- `api.app.license.generate`
- `api.app.license.list`
- `api.app.license.details`
- `api.app.license.delete`
- `api.app.license.reset`

Example `curl` (public):

```bash
curl -s -X POST http://localhost:8080/api/api.public.getProductInfo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

Example `curl` (public batch):

```bash
curl -s -X POST http://localhost:8080/api/api.public.getProductInfoBatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asins":["B0DV53VS61","B0DV53VS62"]}}'
```

Example `curl` (app):

```bash
curl -s -X POST http://localhost:8080/api/api.app.getProductInfo \
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
