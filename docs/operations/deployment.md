---
summary: Defines the RankWrangler Docker topology, production deployment path, service ports, and health checks.
read_when:
  - deploying RankWrangler or checking production container health
  - debugging differences between the direct server, Caddy entrypoint, and PostgreSQL ports
---

# Deployment

Production is served at `https://rankwrangler.merchbase.co`. Caddy serves the website and proxies
`/api` plus the exact hosted MCP and OAuth discovery paths to the Fastify server. Other website
paths are owned by the SPA; `/nginx-health` and `/caddy-health` remain Caddy-local health endpoints.

## Topology

| Compose service | Container | Internal or host port |
| --- | --- | --- |
| `server` | `rankwrangler-server` | Fastify `8080` inside the network |
| `caddy` | `rankwrangler-caddy` | Host `127.0.0.1:8090` to container `80` |
| `postgres` | `rankwrangler-postgres` | Host `127.0.0.1:5433` to container `5432` |

## Deployment

Deploys are **manual**. Pushing to `main` no longer deploys anything: run the `Deploy Stack`
workflow from the Actions tab (`workflow_dispatch`). It runs on the Mac mini's self-hosted runner,
synchronizes the long-lived deployment checkout at `/Users/zknicker/srv/rankwrangler` to the
dispatched commit, and calls `bun run deploy`.

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

### Restart behavior

Compose restart policies reuse the environment Docker baked into the container spec at the last
`up`. Restarting a container — or rebooting the mini — does **not** re-resolve from 1Password; it
replays the values captured by the most recent deploy. That baked copy is the platform's delivered
runtime copy, exactly like a Worker secret. Rotating a credential therefore requires a redeploy, not
just a restart.

## Central-auth staged deployment

Migration `0028` deletes legacy licenses and therefore is never an ordinary first-start migration.
`RANKWRANGLER_DATABASE_MIGRATION_TARGET` has two states:

| Target | Deployment behavior |
| --- | --- |
| `pre-cutover` | Apply through additive migration `0027`; leave the existing production containers unchanged. |
| `latest` | Require the guarded migration to be already applied, then start the new containers. |

Configure Clerk's production `user.created`, `user.updated`, and `user.deleted` webhook endpoint as
`https://rankwrangler.merchbase.co/api/webhooks/clerk/access`. The shorter
`/api/webhooks/clerk` path is not a route and returns `404`.

Before the extension or centralized-auth stack is verified, enable the Clerk production Native API.
`RANKWRANGLER_CLERK_AUTHORIZED_PARTIES` is declared in `.env.schema` as the complete three-party
list:

```text
https://rankwrangler.merchbase.co,chrome-extension://hfoliiddbbblflnaakfggibiiphalbnc,https://clerk.merchbase.co
```

The website/API origin, permanent Chrome extension origin, and Clerk Sync Host are all required.
Omitting the Sync Host can leave extension requests unauthorized even when the website and extension
origins are present. Change it in `.env.schema` and redeploy; do not replace it with a manual SQL or
projection change.

Use this sequence:

1. Keep `RANKWRANGLER_DATABASE_MIGRATION_TARGET` at `pre-cutover` in `.env.schema`. The first workflow run builds
   the central-auth images and applies the additive schema without changing the running license-auth
   application.
2. Populate the exact Access Projection directly from current Clerk metadata while the old
   containers remain live. This one-off uses the new image without publishing its server or webhook,
   requires explicit Clerk subject and Merchbase User identifiers, and emits only fingerprints:

   ```bash
   bunx varlock run -- docker compose -p rankwrangler -f apps/server/compose.yml \
     run --rm --no-deps -e RANKWRANGLER_DATABASE_MIGRATION_TARGET=pre-cutover \
     server node dist/index.js --bootstrap-access-projection \
     --clerk-subject=<user_...> --merchbase-user-id=<mbu_...>
   ```

   The command uses `@merchbaseco/access` to load Clerk public metadata and applies it through the
   normal projection store. It fails on missing, denied, expired, mismatched, or ambiguously stored
   identity state. It never derives a mapping from email or writes a manual SQL projection.
   From an approved checked-out source tree, the equivalent command is:

   ```bash
   RANKWRANGLER_DATABASE_MIGRATION_TARGET=pre-cutover \
     bunx varlock run -- bun run --cwd apps/server central-auth:bootstrap-projection -- \
     --clerk-subject=<user_...> --merchbase-user-id=<mbu_...>
   ```

   The bootstrap entrypoint itself caps its migration run at `pre-cutover`, even if the surrounding
   environment is misconfigured as `latest`.
3. Verify the additive tables, then enter a maintenance window before copying metering or approving
   gates. Stop Caddy and the old server so no legacy usage debit can race the preservation proof.
   Rerun the projection bootstrap after traffic stops so gate approval uses the latest Clerk state.
4. Create the temporary production backup, restore it to a disposable database, and complete the
   before/after preservation proof. Populate only explicit production mappings and approved gates.
5. With PostgreSQL still running and application traffic stopped, run the guarded migration:

   ```bash
   bunx varlock run -- docker compose -p rankwrangler -f apps/server/compose.yml \
     run --rm --no-deps -e RANKWRANGLER_DATABASE_MIGRATION_TARGET=latest \
     server node dist/index.js --migrate-only
   ```

6. Set `RANKWRANGLER_DATABASE_MIGRATION_TARGET` to `latest` in `.env.schema`, verify the migration, and start the new stack:

   ```bash
   bunx varlock run -- docker compose -p rankwrangler -f apps/server/compose.yml \
     run --rm --no-deps -e RANKWRANGLER_DATABASE_MIGRATION_TARGET=latest \
     server node dist/index.js --verify-migrations
   bunx varlock run -- docker compose -p rankwrangler -f apps/server/compose.yml up -d
   ```

7. Complete health, Clerk session, API-key/OAuth, projection, metering, job, Chrome, and Safari
   verification. Delete the temporary backup only after all end-to-end checks pass.

Do not set `latest` before the explicit guarded migration succeeds. The deployment workflow uses a
read-only migration verification in that state and refuses to replace the existing containers when
`0028` is absent.

## Verification

```bash
curl --fail https://rankwrangler.merchbase.co/api/health
curl --fail https://rankwrangler.merchbase.co/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://rankwrangler.merchbase.co/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
docker compose -p rankwrangler -f apps/server/compose.yml ps
docker logs rankwrangler-server --tail 50
docker logs rankwrangler-caddy --tail 50
```

Migration or startup failures appear in the server logs. If code is unexpectedly stale, verify
the deployed commit before forcing a no-cache rebuild.

The MCP POST smoke check should return `401` with a `WWW-Authenticate` bearer challenge when no
OAuth token is supplied. The protected-resource check should return JSON metadata, not the website
SPA. Caddy owns only `/mcp`, `/.well-known/oauth-protected-resource`,
`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`, and
`/.well-known/oauth-authorization-server/mcp` for this ingress.

## Schema Changes

Update the relevant Drizzle schema source, then ask the user to run:

```bash
bunx drizzle-kit generate
```

Do not hand-write migration files. Keep `apps/server/init.sql` aligned with generated SQL for a
fresh stack.
