---
summary: Defines the RankWrangler Docker topology, production deployment path, service ports, the external health report, and container liveness checks.
read_when:
  - deploying RankWrangler or checking production container health
  - debugging differences between the direct server, Caddy entrypoint, and PostgreSQL ports
---

# Deployment

Production is served at `https://rankwrangler.merchbase.co`. Caddy serves the website and proxies
`/api`, `/health/live`, and the exact hosted MCP and OAuth discovery paths to the Fastify server.
Other website paths are owned by the SPA; `/nginx-health` and `/caddy-health` remain Caddy-local
health endpoints.

`GET /api/health` reports whether the stack can do its work: the database answers and Keepa and
SP-API are reachable. It is not a backlog report. Work is a queue drained as fast as the providers
allow, so a backlog while a backfill drains is never a failing check. Container
healthchecks, Caddy's upstream probe, and the deploy smoke use `GET /health/live`, which only checks
that the process can run `SELECT 1`. Both URLs return 200 `{"status":"ok","revision":"<sha>"}`, or
503 `{"status":"degraded","failing":[...],"revision":"<sha>"}` with check names only. `revision` is
the full commit SHA that `bun run deploy` built the image from. Local runs, tests, and images
built outside that script report `dev`.

| Check | Failing when |
| --- | --- |
| `postgres` | `SELECT 1` fails |
| `keepa` | The last 15 minutes hold at least three Keepa calls and none was answered. A 429 (out of tokens or throttled) counts as an answer. No recent calls is not failing. |
| `spapi` | The same rule for SP-API calls. |

## Topology

| Compose service | Container | Internal or host port |
| --- | --- | --- |
| `server` | `rankwrangler-server` | Fastify `8080` inside the network |
| `caddy` | `rankwrangler-caddy` | Host `127.0.0.1:8090` to container `80` |
| `postgres` | `rankwrangler-postgres` | Host `127.0.0.1:5433` to container `5432` |

## Deployment

- A push to `main` deploys after the Quality workflow succeeds for that commit. Deploy Stack calls `merchbaseco/workflows/.github/workflows/deploy-service.yml` at `@main`.
- `workflow_dispatch` redeploys the current tip of `main`. Set `ref` to a SHA on `main` to roll back or redeploy that commit.
- Production uses Cloudflare-billed PlanetScale through the remote Compose override. Local development uses PostgreSQL in Compose.
- The runner fast-forwards `/Users/zknicker/srv/rankwrangler`, runs `bun run setup`, then runs `bun run deploy`. It skips a commit that is not a descendant of the live checkout unless `ref` is set.
- After images build and the existing cutover gate is verified, it stops the old server before
  applying migrations. The new container starts only after migration verification. A migration
  failure leaves the server stopped. Inspect the applied schema before restarting any old image.
- It polls `/health/live` for up to 600 seconds until that URL returns `"status":"ok"` and `"revision"` of the deployed SHA. A stale `/api/health` report does not fail the deploy.
- It publishes `@rankwrangler/http-client` and `@rankwrangler/cli` from a GitHub-hosted runner when that version is not on npm, so provenance is allowed, then pushes `vX.Y.Z` if the tag is missing.
- A later job fails when a published package changed since its tag without a version bump. That job does not fail the deploy.

### Source to runtime

| Stage | Owner |
| --- | --- |
| Declaration | `.env.schema` — canonical names, types, sensitivity, per-lifecycle `op()` references |
| Secret store | 1Password `Production` vault (`Development` for local, `Tooling` for publishing) |
| Resolution | `scripts/deploy-with-varlock.ts`, pinned to `VARLOCK_ENV=production` |
| Delivery | `varlock run -- docker compose …`; Compose interpolates `${VAR}` from process environment |
| Runtime | The environment Docker bakes into each container at `up` time |

No `.env` file is read or written anywhere on this path. `--env-file` is deliberately absent.

Two identities fill the same role slot, `DEPLOY_AGENT_PRODUCTION_OP_TOKEN`:

| Venue | Identity | How it arrives |
| --- | --- | --- |
| `Deploy Stack` workflow (preferred) | GitHub deploy agent | Repository secret `GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN` |
| Operator at the mini | Mac Mini production Varlock | `scripts/deploy-with-varlock.ts` re-execs under `op run` |

The private `@merchbaseco/*` install token reaches the image build as a BuildKit secret mount — never
a build argument, image environment variable, or layer. In the workflow it is the repository-scoped
`github.token`; for a hand-run build it comes from `varlock printenv` under the install switch.

### Commands

```bash
bun run deploy:dry-run   # resolve every op() ref and render Compose; touches nothing
bun run deploy           # build, migrate per target, replace containers, verify
bun run deploy:verify    # name-diff the delivered container env against the schema
```

`deploy:dry-run` is the first rung of the ladder: a missing 1Password item fails there, before
anything is built or replaced.

### Product cutout storage

The on-demand `cutoutThumbnail` include requires Cloudflare Images transformations on
`rankwrangler.merchbase.co`, with remote image sources from `m.media-amazon.com` and
`images-*.ssl-images-amazon.com` allowed. Create the R2 Standard bucket
`rankwrangler-thumbnails` and serve it through the custom domain
`images.rankwrangler.merchbase.co`. Public reads use that domain; uploads use a token scoped to
this bucket. Store its access key ID as `username` and secret access key as `credential` in the
Production vault item `Cloudflare R2 - RankWrangler`. The Atlas R2 token is scoped to Atlas's
private bucket and does not grant RankWrangler access. Run `bun run deploy:dry-run` after the item
exists, and verify a generated cutout URL returns a transparent WebP before deployment is complete.

### Restart behavior

Compose restart policies reuse the environment Docker baked into the container spec at the last
`up`. Restarting a container — or rebooting the mini — does **not** re-resolve from 1Password; it
replays the values captured by the most recent deploy. That baked copy is the platform's delivered
runtime copy, exactly like a Worker secret. Rotating a credential therefore requires a redeploy, not
just a restart.

## Authentication migration

The older license-to-canonical-user cutover through migration `0028` is historical.
It must already be applied before deploying the current stack. Do not replay its
Clerk bootstrap, webhook, or Native API setup for the Cloudflare migration.

Follow [Authentication](../internals/authentication.md) for the current host/audience,
projection, OAuth and development contracts. The coordinated suite cutover supplies the
new Cloudflare configuration, preserves existing canonical users and service accounts,
applies later additive migrations, and verifies key aliases and revocation. Keep a
verified database backup and the prior deployment revision for rollback. Publish and
change production only after the operator authorizes the prepared release.

## Verification

```bash
curl --fail https://rankwrangler.merchbase.co/health/live
curl --fail https://rankwrangler.merchbase.co/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://rankwrangler.merchbase.co/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
docker compose -p rankwrangler -f apps/server/compose.yml ps
docker logs rankwrangler-server --tail 50
docker logs rankwrangler-caddy --tail 50
```

Migration or startup failures appear in the server logs. If code is unexpectedly stale, verify
the deployed commit before forcing a no-cache rebuild. Compare `revision` from
`curl -s https://rankwrangler.merchbase.co/health/live` with the deployed SHA.

The MCP POST smoke check should return `401` with a `WWW-Authenticate` bearer challenge when no
OAuth token is supplied. The protected-resource check should return JSON metadata, not the website
SPA. Caddy forwards `/mcp`, `/.well-known/oauth-protected-resource`,
`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`, and
`/.well-known/oauth-authorization-server/mcp` to Fastify, separate from `/api` and `/health/live`.

## Schema Changes

Update the relevant Drizzle schema source, then ask the user to run:

```bash
bunx drizzle-kit generate
```

Do not hand-write migration files. Keep `apps/server/init.sql` aligned with generated SQL for a
fresh stack.
