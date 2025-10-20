# RankWrangler Server

API backend for RankWrangler’s Amazon SP-API integration. The service is deployed as a container from GitHub Container Registry (GHCR) and fronted by the shared Caddy proxy at `merchbase.co/api/*`.

## Local Development

```bash
yarn install
cp apps/server/.env.example apps/server/.env
# populate apps/server/.env with valid SP-API credentials
docker compose -f apps/server/docker-compose.yml up --build
```

The compose file now builds with the repository root as the build context, so recompiles pick up changes across the workspace.

## Docker Image

- Dockerfile: `apps/server/Dockerfile`
- Image name: `ghcr.io/merchbaseco/rankwrangler-server`
- Health endpoint: `GET /api/health`

The image is multi-stage: Turbo builds the server, `yarn workspaces focus` trims dependencies, and the runtime stage runs as an unprivileged user with `dumb-init`.

## Deployment

1. Commits on `main` trigger `.github/workflows/deploy.yml`.
2. The workflow builds and pushes the image to GHCR with tags `latest` and the commit SHA.
3. It SSHes to the Hetzner host as the `rankwrangler` user, pulls `merchbase-infra`, and runs `stack/rankwrangler/deploy.sh` to roll the stack.

## Stack Layout

The production stack (defined in `merchbase-infra/stack/rankwrangler/docker-compose.yml`) runs three containers:

- `rankwrangler-postgres`: persistent database (`postgres_data` volume)
- `rankwrangler-server`: Fastify API running the GHCR image
- `rankwrangler-caddy`: internal reverse proxy that exposes the API on port 8090 for the edge Caddy

## Configuration

Environment variables are loaded from the stack `.env` file and include:

| Variable | Purpose |
| --- | --- |
| `RANKWRANGLER_IMAGE_TAG` | Image tag to deploy (commit SHA or `latest`) |
| `DATABASE_PASSWORD` | Postgres password shared by the server and DB |
| `LICENSE_SECRET`, `SESSION_SECRET` | Secrets for licensing/session management |
| `SPAPI_*` | Amazon SP-API credentials |

The server itself also respects optional `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` for bootstrap login.

## API Endpoints

- `POST /api/searchCatalog` – search Amazon’s catalog (requires auth)
- `GET /api/health` – liveness probe used by Docker and infrastructure health checks

## Useful Commands

```bash
yarn build:server              # Turbo build for the server package
docker compose -f apps/server/docker-compose.yml build
docker build -f apps/server/Dockerfile . --target runtime  # one-off image build
```

To deploy a specific tag manually from the stack directory on the server:

```bash
cd ~/merchbase-infra/stack/rankwrangler
export RANKWRANGLER_IMAGE_TAG=<sha or tag>
./deploy.sh
```
