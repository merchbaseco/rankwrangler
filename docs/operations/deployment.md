---
summary: Defines the RankWrangler Docker topology, production deployment path, service ports, and health checks.
read_when:
  - deploying RankWrangler or checking production container health
  - debugging differences between the direct server, Caddy entrypoint, and PostgreSQL ports
---

# Deployment

Production is served at `https://rankwrangler.merchbase.co`. Caddy serves the website and proxies
`/api` to the Fastify server.

## Topology

| Compose service | Container | Internal or host port |
| --- | --- | --- |
| `server` | `rankwrangler-server` | Fastify `8080` inside the network |
| `caddy` | `rankwrangler-caddy` | Host `127.0.0.1:8090` to container `80` |
| `postgres` | `rankwrangler-postgres` | Host `127.0.0.1:5433` to container `5432` |

## Manual Deployment

From the repository root:

```bash
docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml build
docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml up -d
```

Restart without rebuilding:

```bash
docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml up -d
```

Pushes to `main` run the self-hosted deploy workflow. It synchronizes the long-lived deployment
checkout at `/Users/zknicker/srv/rankwrangler` to the pushed commit, then rebuilds the Compose
stack.

## Verification

```bash
curl --fail https://rankwrangler.merchbase.co/api/health
docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml ps
docker logs rankwrangler-server --tail 50
docker logs rankwrangler-caddy --tail 50
```

Migration or startup failures appear in the server logs. If code is unexpectedly stale, verify
the deployed commit before forcing a no-cache rebuild.

## Schema Changes

Update the relevant Drizzle schema source, then ask the user to run:

```bash
bunx drizzle-kit generate
```

Do not hand-write migration files. Keep `apps/server/init.sql` aligned with generated SQL for a
fresh stack.
