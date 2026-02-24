# Operations Runbook

Use this document for environment setup, common commands, extension build-order issues, and deployment workflows.

## Local Commands

Run from `apps/server` unless noted:

- `bun run build` - server SSR build with Vite
- `bun run start` - run compiled server with repo-root `.env` via `dotenv-cli`
- `docker compose up --build` - local stack with PostgreSQL
- `./test-api.sh` - curl smoke tests for core endpoints

From repo root (monorepo-wide tasks):

- `bun install`

## Environment Management

- Copy `.env.example` (repo root) to `.env` and populate values locally.
- Keep `.env` out of version control.
- Add new env vars in two places:
  1. `apps/server/src/config/env.ts` (validation)
  2. `.env.example` (placeholder)

## Extension Build Order (Fresh Environments)

If extension build/type-check fails with:

`TS2307: Cannot find module '@rankwrangler/http-client'`

Run from repo root:

```bash
bun install
bun run --filter rankwrangler-extension build
```

Use this order before extension-only TS checks in fresh environments.

## Deployment

### Build and deploy

Run from `apps/server`:

```bash
docker compose up -d --build
```

Rebuild server without cache:

```bash
docker compose build --no-cache server
docker compose up -d server
```

Restart without rebuild:

```bash
docker compose up -d
```

From repo root:

```bash
docker compose -f apps/server/compose.yml up -d --build
```

### Service names

- `server` -> `rankwrangler-server`
- `caddy` -> `rankwrangler-caddy`
- `postgres` -> `rankwrangler-postgres`

### Health checks

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep rankwrangler
docker logs rankwrangler-server --tail 50
docker logs rankwrangler-caddy --tail 50
```

### Common issues

Server unhealthy after deploy (migration/startup failures):

```bash
docker logs rankwrangler-server 2>&1 | tail -30
```

Code changes not reflected (cached layers):

```bash
docker compose build --no-cache server
```
