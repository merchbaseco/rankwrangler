# Database And Deployment

## Database Migrations

- Drizzle migrations live in `apps/server/drizzle`
- Source-of-truth schema: `apps/server/src/db/schema.ts`
- Generate migrations:

```bash
bunx drizzle-kit generate
```

- Keep `apps/server/init.sql` in sync with generated migration SQL

## Deployment

From `apps/server`:

```bash
# Full rebuild and deploy
docker compose up -d --build

# Rebuild specific service
docker compose build --no-cache server
docker compose up -d server

# Restart without rebuild
docker compose up -d
```

From repo root:

```bash
docker compose -f apps/server/compose.yml up -d --build
```

## Service Names

- `server` -> `rankwrangler-server`
- `caddy` -> `rankwrangler-caddy`
- `postgres` -> `rankwrangler-postgres`

## Health Checks

```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep rankwrangler

# Server logs
docker logs rankwrangler-server --tail 50
```

## Docker Services

- `postgres` – PostgreSQL 15
- `server` – Node API service
- `caddy` – reverse proxy (port 8090)
