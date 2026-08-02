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

`@merchbaseco/access` is a private GitHub Package. Export `GITHUB_PACKAGES_TOKEN` from the approved
secret store before building. Compose mounts it into the Bun install step as a BuildKit secret; it
is not a build argument, image environment variable, layer, or runtime-container value. Supplying
the name in `--env-file` alone does not create the BuildKit secret.

From the repository root:

```bash
export GITHUB_PACKAGES_TOKEN=<read token from the approved secret store>
docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml build
```

Building does not replace running containers. Follow the central-auth staged deployment below;
do not run `up` while the migration target is `pre-cutover`. After cutover, restart without
rebuilding only when `DATABASE_MIGRATION_TARGET=latest`:

```bash
docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml up -d
```

Pushes to `main` run the self-hosted deploy workflow. It synchronizes the long-lived deployment
checkout at `/Users/zknicker/srv/rankwrangler` to the pushed commit and rebuilds the Compose images.
The workflow grants `packages: read` and exposes its repository-scoped `github.token` to Compose as
`GITHUB_PACKAGES_TOKEN`; explicit package access for `merchbaseco/rankwrangler` is required.

## Central-auth staged deployment

Migration `0028` deletes legacy licenses and therefore is never an ordinary first-start migration.
`DATABASE_MIGRATION_TARGET` has two states:

| Target | Deployment behavior |
| --- | --- |
| `pre-cutover` | Apply through additive migration `0027`; leave the existing production containers unchanged. |
| `latest` | Require the guarded migration to be already applied, then start the new containers. |

Configure Clerk's production `user.created`, `user.updated`, and `user.deleted` webhook endpoint as
`https://rankwrangler.merchbase.co/api/webhooks/clerk/access`. The shorter
`/api/webhooks/clerk` path is not a route and returns `404`.

Use this sequence:

1. Keep production `.env` at `DATABASE_MIGRATION_TARGET=pre-cutover`. The first workflow run builds
   the central-auth images and applies the additive schema without changing the running license-auth
   application.
2. Populate the exact Access Projection directly from current Clerk metadata while the old
   containers remain live. This one-off uses the new image without publishing its server or webhook,
   requires explicit Clerk subject and Merchbase User identifiers, and emits only fingerprints:

   ```bash
   docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml \
     run --rm --no-deps -e DATABASE_MIGRATION_TARGET=pre-cutover \
     server node dist/index.js --bootstrap-access-projection \
     --clerk-subject=<user_...> --merchbase-user-id=<mbu_...>
   ```

   The command uses `@merchbaseco/access` to load Clerk public metadata and applies it through the
   normal projection store. It fails on missing, denied, expired, mismatched, or ambiguously stored
   identity state. It never derives a mapping from email or writes a manual SQL projection.
   From an approved checked-out source tree with production environment variables already loaded,
   the equivalent command is:

   ```bash
   DATABASE_MIGRATION_TARGET=pre-cutover \
     bun run --cwd apps/server central-auth:bootstrap-projection -- \
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
   docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml \
     run --rm --no-deps -e DATABASE_MIGRATION_TARGET=latest \
     server node dist/index.js --migrate-only
   ```

6. Set `DATABASE_MIGRATION_TARGET=latest`, verify the migration, and start the new stack:

   ```bash
   docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml \
     run --rm --no-deps -e DATABASE_MIGRATION_TARGET=latest \
     server node dist/index.js --verify-migrations
   docker compose -p rankwrangler --env-file .env -f apps/server/compose.yml up -d
   ```

7. Complete health, Clerk session, API-key/OAuth, projection, metering, job, Chrome, and Safari
   verification. Delete the temporary backup only after all end-to-end checks pass.

Do not set `latest` before the explicit guarded migration succeeds. The deployment workflow uses a
read-only migration verification in that state and refuses to replace the existing containers when
`0028` is absent.

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
