# Runtime And Local Development

## Production

- URL: `https://rankwrangler.merchbase.co`
- Health check: `GET /api/health`
- Website: `GET /` (served by stack Caddy container)

## Local Development (Docker)

```bash
bun install
cp .env.example .env
# Fill in .env with your credentials (repo root)
docker compose -f apps/server/compose.yml up --build
```

If running from `apps/server`, pass the env file explicitly:

```bash
docker compose --env-file ../.env up --build
```

Local endpoints:

- API: `http://localhost:8090/api/health`
- Website: `http://localhost:8090/`

Local Postgres binds to `127.0.0.1:5433`.

## Dev (No Docker)

If running server directly while Postgres runs in Docker:

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5433
```

Local dev scripts disable background workers by default:

```bash
bun run server:dev
bun run dev
```

To opt back into running job workers locally:

```bash
bun run server:dev:jobs
bun run dev:jobs
```

You can also override the runtime flag manually:

```bash
DISABLE_SERVER_JOB_RUNNER=false bun run server:dev
```

## Scripts

- `bun run build` – bundle server with Vite
- `bun run start` – run compiled server
- `bun run dev` – run server with `DISABLE_SERVER_JOB_RUNNER=true` by default
- `bun run dev:jobs` – run server with local job workers enabled
- `bun run cli -- products get <ASIN...> --marketplace <id>` – product lookup
- `bun run cli -- license status` – license usage/limit snapshot
- `bun run cli -- config set api-key <value>` – configure CLI defaults
- `./test-api.sh` – smoke test health + public/app API auth
