# RankWrangler Server

Fastify-based API for RankWrangler's Amazon SP-API integration.

## Hosting

Deployed on Mac Mini via self-hosted GitHub Actions runner.

- **URL:** https://api.merchbase.co
- **DB Viewer:** https://db.merchbase.co (Drizzle Gateway)
- **Local port:** 8090

## Deployment

Push to `main` triggers automatic build and deploy via self-hosted runner.

Manual deploy:
```bash
cd /Users/zknicker/srv/rankwrangler
git pull
docker compose build
docker compose up -d
```

## Local Development

```bash
npm install
cp .env.example .env
# Fill in .env with your credentials
docker compose up --build
```

The API will be available at `http://localhost:8090/api/health`.

## Scripts

- `npm run build` – bundle the server with Vite
- `npm run start` – run the compiled server
- `./test-api.sh` – smoke test the health endpoint

## Database Migrations

Drizzle migrations live under `./drizzle`. Update the schema in `src/db/schema.ts`, run `npx drizzle-kit generate`, and commit the generated SQL alongside `init.sql`.

## Docker Services

- `rankwrangler-postgres` – PostgreSQL 15 database
- `rankwrangler-server` – Node.js API server
- `rankwrangler-caddy` – Reverse proxy (port 8090)
- `rankwrangler-drizzle-gateway` – DB viewer (port 4983)

Health endpoint: `GET /api/health`
