---
summary: Defines local RankWrangler setup, environment ownership, development commands, worker defaults, and focused verification entrypoints.
read_when:
  - setting up RankWrangler locally or choosing a development command
  - filling a local or Cursor cloud database with synthetic Products, Search runs, keywords, and activity
  - debugging environment loading, local ports, dev server bind addresses, disabled workers, or extension dependency order
  - changing the Quality workflow, the `check` scripts, or which gates run on every commit
---

# Development

## Setup

```bash
bun install --frozen-lockfile
```

There is no `.env` step. The committed `.env.schema` is the environment contract: it declares every
variable's canonical name, type, and sensitivity, and resolves values per lifecycle from 1Password.
Local development authorizes through the 1Password desktop app, so the first resolution of a session
raises one approval prompt.

Adding a variable means adding it in four places, which `bun run env:contract` enforces: `.env.schema`,
the typed surface in `apps/server/src/config/env.ts`, the Compose `environment:` block, and — for a
`VITE_` value — both the Compose build argument and the matching `ARG` in `Dockerfile.caddy`.

```bash
bun run env:check      # validate the schema offline against the test lifecycle
bun run env:contract   # name-only diff across all five delivery points
bun run env:load       # resolved values, secrets masked
```

The schema points development at `127.0.0.1:5433`, which is where Compose publishes Postgres. Start
just the database and run the stack on the host:

```bash
bun run --filter @rankwrangler/server exec docker compose -f compose.yml up -d postgres
bun run db:seed:dev
bun run dev
```

## Common Commands

Every command that needs configuration runs under `varlock run`, which resolves the schema and
passes values as process environment. No command reads a `.env` file.

| Task | Command |
| --- | --- |
| Synthetic development data | `bun run db:seed:dev` |
| Server and website | `bun run dev` |
| Server only | `bun run server:dev` |
| Server and website with job workers | `bun run dev:jobs` |
| Server only with job workers | `bun run server:dev:jobs` |
| Server build | `bun run server:build` |
| Website build | `bun run website:build` |
| Extension build | `bun run extension:build` |
| CLI build | `bun run cli:build` |
| CLI end-to-end tests | `bun run cli:test:e2e` |
| Documentation routes | `bun run docs:list` |
| Full offline gate | `bun run check` |
| Fast offline gate — what CI runs | `bun run check:fast` |

## Synthetic Development Data

`bun run db:seed:dev` fills a local database with a synthetic recent week: a Merch-style Product
catalog with facets and Keepa history, Catalog queries with Search-run evidence, Brand Analytics
Top Search Terms snapshots, and the activity, job, and Provider-telemetry rows behind the Logs
page. It is about 3,400 rows and takes well under a second. Every timestamp is generated relative
to the moment the command runs, so the dashboard opens on the current week rather than a frozen
fixture. The generator is seeded, so the same seed always produces the same catalog.

Before it writes a single Product it grants the shared Dev Sign-In user access to this database,
because a seeded week nobody can read is worth nothing. Development receives no Clerk webhooks, so a
freshly migrated database has no Access Projection and every `api.app.*` call fails before any of
this data is reachable. `bootstrapDevAccessProjection` from `@merchbaseco/access/dev` writes the
projection the webhook would have written, and the seed also mints the RankWrangler Service Account
for that user so the usage surfaces open on a real account. Nothing here is per-tenant: the Product
catalog belongs to the database, not to a seller, so the Service Account is the only row the seed has
to attach to anybody. [Authentication](../internals/authentication.md) owns the details, including
what to do about `DevAccessBootstrapError`.

Every run ends with a receipt — database target, the Clerk subject and Merchbase User the session
will authenticate as, the day the week runs through, and the row counts behind each page:

```
[Seed] ─── Development seed receipt ───────────────────────────
[Seed]   Database        127.0.0.1:5433/rankwrangler
[Seed]   Signed-in user  mbu_… (Clerk user_… @ https://tolerant-roughy-27.clerk.accounts.dev)
[Seed]   Through day     2026-08-26 (7 days from 2026-08-20)
[Seed]   Products        64
[Seed]   Catalog queries 10
[Seed]   History points  1829
[Seed]   Search terms    710
[Seed]   Log rows        245
[Seed]   Total rows      3389
```

Two properties are load-bearing.

**It only runs against loopback.** The seed clears and rewrites the tables it owns, so it refuses
any `RANKWRANGLER_DATABASE_HOST` that is not `127.0.0.1`, `::1`, or `localhost`, and refuses
`NODE_ENV=production` outright. There is no override flag, because several local workflows point
deliberately at production and a flag is exactly what someone would reach for at the wrong moment.

**It is idempotent.** Every row it writes is marked in its own primary key, and a run clears only
rows carrying that marker before writing the new week. Re-running replaces the previous synthetic
week and leaves alone anything you collected by hand against the same database, with one cascade
worth knowing: a real search for a term the seed invented reuses the seeded Catalog query, so
clearing that query also clears the real Search run hanging off it. The access bootstrap is
idempotent on the same terms — its event id is fixed per issuer, so repeated seeding applies exactly
one projection event no matter how many times it runs.

The seed migrates to the `latest` target before writing. This matters: `.env.schema` resolves
`RANKWRANGLER_DATABASE_MIGRATION_TARGET` to the guarded `pre-cutover` value outside production,
which stops eight migrations short of the schema the application queries, so a freshly created
development database cannot serve the catalog at all until something brings it current. The
development server's own startup migration then finds nothing left to apply and logs a no-op
`pre-cutover` line, which is expected.

Cursor cloud agents seed automatically: `.cursor/start.sh` runs the command on every boot, after
provisioning the local cluster and before launching the servers, so a cloud agent opens on a
populated dashboard, already signed in, and a resumed one re-anchors to the current week. The seed's
whole output — receipt included — goes straight to the boot log; nothing is captured or discarded, so
a boot that half-worked says so. Local checkouts never seed implicitly — a local database may be
pointed anywhere, so the command stays explicit.

`apps/server/src/dev-seed/plan.test.ts` is a coverage contract rather than a unit test: it asserts
what the seed promises the dashboard, and it asserts those promises through the shipped code that
implements them. Every Catalog-query status badge appears because the real
`deriveCatalogQueryStatus` derives it; keyword rows are merch-classified because the real
`classifyMerchKeyword` classified them; no Product is stale because the real
`PRODUCT_DEFAULT_MAX_AGE_MS` says so — which is also what keeps a seeded dashboard from calling
Keepa or SP-API. `local-database-guard.test.ts` proves the refusals, including against the
production host as `.env.schema` declares it. Both run in `bun run check:fast`.

## Quality is the fast lane, on purpose

`bun run check` is split, and the split is deliberate — preserve it.

`bun run check:fast` is the polite lane: `env:check`, `env:contract`, and
`test` (the typed-client, extension-auth, server, and release suites — pure
CPU, well under a second all together). It is what the Quality workflow's
`Check` job runs on every push and pull request. `bun run check` is
`check:fast` plus `bun run server:build`. Total coverage is unchanged; the
build simply stops running on every commit, because the Deploy workflow builds
the image for real on the Mac mini and is the build's proof.

`bun run test:server` runs the server suite the way the gate does, under
`varlock run` on the schema's `test` lifecycle. That matters: the suite loads
`apps/server/src/config/env.ts`, which throws when Clerk and SP-API values are
absent, and a single module that throws while loading poisons every later
import of it in the same Bun process. Run the suite bare and you get a cascade
of `Cannot access 'appRouter' before initialization` from files that are
themselves fine. Redaction is off for this lane on purpose — the `test`
lifecycle holds only placeholders, and redacting them rewrites the middle of
every file path in the output.

Database-backed tests are the exception, and they get their own parallel
`Database` job rather than a place in the fast lane. `bun run --filter
@rankwrangler/server test:catalog-db` builds a throwaway PostgreSQL cluster in
a `mktemp -d` directory, proves the migration targets, the backup and rollback
path, and the preservation manifest, then runs the `*.db.test.ts` files against
it and tears the cluster down. Those tests skip themselves when that harness is
absent, so they cost the fast lane nothing and never touch a shared or
production database. CI runs the same script on the same private-cluster path a
checkout does; it only has to put the runner image's PostgreSQL binaries on
PATH first.

This shape is fleet-wide, not a RankWrangler quirk: Quality answers one question
per push — is the contract intact and does the fast stuff pass? — in under about
sixty seconds, with installs capped at `timeout-minutes: 5` and a concurrency
group that cancels in progress. Application builds, browser and GPU tests,
golden corpora, and licensed or heavyweight downloads belong to full `check`
instead. Treat that division as the standard when editing the Quality workflow:
new weight goes to `check` or to a parallel job, never into `Check`.

Local server scripts disable the job runner by default — the schema resolves
`RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER` to `true` outside production. Use a `*:jobs` command only
when the task requires schedules or background execution.

The direct server listens on port `8080` by default and binds every interface. Vite serves the
website on its configured dev port and proxies `/api` to the server. Use `dev-port` for new
checkout-specific harnesses instead of adding fixed ports. In non-production environments, the
server accepts HTTP CORS origins from loopback hosts on any port so checkout-specific website
previews can use their assigned port.

`RANKWRANGLER_DEV_HOST` is the repository's contract for Vite's bind address, and
`apps/website/vite.config.ts` is its only reader. It defaults to `127.0.0.1`, which is not the same
as Vite's own default of `localhost`: on a host that resolves `localhost` to `::1` first, Vite binds
IPv6 only, and an IPv4 client — or a port forwarder watching for listening sockets — never sees it.
An environment reached through such a forwarder sets `0.0.0.0` for its own dev command;
`.cursor/start.sh` exports exactly that before launching, which is where the knowledge that Cursor
forwards ports this way belongs. App code stays vendor-neutral, and everywhere else the loopback
default keeps the dev server — and the synthetic seed data behind it — off the network. Only the
socket widens; the origin the app believes it serves is unchanged.

## Docker Development

From the repository root:

```bash
bunx varlock run -- docker compose -p rankwrangler -f apps/server/compose.yml up --build
```

`varlock run` supplies every `${VAR}` Compose interpolates. The private-package install token is an
internal schema item, so `varlock run` does not export it; fetch it explicitly when building by hand:

```bash
export MERCHBASE_GITHUB_NPM_TOKEN=$(RANKWRANGLER_RESOLVE_INSTALL_TOKENS=true \
  bunx varlock printenv MERCHBASE_GITHUB_NPM_TOKEN)
```

The Caddy entrypoint is `http://localhost:8090`; PostgreSQL binds to `127.0.0.1:5433`.

## Focused Checks

- Server/API changes: build the server and run the affected Bun tests.
- Website changes: build the website and exercise the changed path.
- Extension changes: build the extension; use [Extension preview](extension-preview.md) for UI.
- Public API or CLI changes: rebuild generated client types before CLI verification.
- Documentation changes: run `bun run docs:list` and validate local links.

If a fresh extension build cannot resolve `@rankwrangler/http-client`, run the root install and
then `bun run extension:build`; the extension build prepares its workspace dependency.
