# RankWrangler Server

Fastify-based API for RankWrangler’s Amazon SP-API integration. The service is distributed as a Docker container via GitHub Container Registry (GHCR) and fronts the `/api/*` routes behind the public Caddy proxy at `merchbase.co`.

## Requirements

- Node.js 18+
- Yarn 4 (Corepack enabled)
- Docker (optional, for container builds)

## Setup

```bash
yarn install
cp .env.example .env
# fill .env with valid SP-API credentials before starting
```

## Local Development

Run the API in development mode with Docker and PostgreSQL:

```bash
docker compose up --build
```

This uses the local `docker-compose.yml`, which builds the server image from the current workspace and wires the exposed port `8080`.

To build and run the service manually:

```bash
yarn build
NODE_ENV=production yarn start
```

## Scripts

- `yarn build` – bundle the server with Vite
- `yarn start` – run the compiled server using `dotenv-cli` (expects `dist/index.js`)
- `yarn deploy` – helper script for the legacy standalone deployment (exits with guidance)
- `./scripts/commands.sh` – utilities for managing the production container over SSH (`logs`, `status`, `restart`, etc.)
- `./test-api.sh` – quick smoke tests for the health check endpoint

## Docker

- Dockerfile: `./Dockerfile`
- Compose files for local testing and stack orchestration: `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.stack.yml`
- Health endpoint: `GET /api/health`

The default GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and pushes `ghcr.io/merchbaseco/rankwrangler-server` and triggers the infrastructure deployment in `merchbase-infra`.

## Database Migrations

Drizzle migrations live under `./drizzle`. Update the schema in `src/db/schema.ts`, run `yarn drizzle-kit generate`, and commit the generated SQL alongside `init.sql`.

## Testing

Manual smoke tests:

```bash
./test-api.sh
```

This script hits the health endpoint. Add new automated tests when extending the API surface.
