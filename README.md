# RankWrangler Server

Fastify-based API for RankWrangler's Amazon SP-API integration.

## Production

- **URL:** https://rankwrangler.merchbase.co
- **Health check:** `GET /api/health`

## Local Development

```bash
npm install
cp .env.example .env
# Fill in .env with your credentials
docker compose up --build
```

The API will be available at `http://localhost:8090/api/health`.

Postgres is bound to `HOST_IP` (set in `.env`) on port `5433`. Use `127.0.0.1` for local-only access.

## Scripts

- `npm run build` – bundle the server with Vite
- `npm run start` – run the compiled server
- `./test-api.sh` – smoke test the health endpoint

## Database Migrations

Drizzle migrations live under `./drizzle`. Update the schema in `src/db/schema.ts`, run `npx drizzle-kit generate`, and commit the generated SQL alongside `init.sql`.

## Docker Services

- `postgres` – PostgreSQL 15 database
- `server` – Node.js API server
- `caddy` – Reverse proxy (port 8090)
