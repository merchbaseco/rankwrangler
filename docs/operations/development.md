---
summary: Defines local RankWrangler setup, environment ownership, development commands, worker defaults, and focused verification entrypoints.
read_when:
  - setting up RankWrangler locally or choosing a development command
  - debugging environment loading, local ports, disabled workers, or extension dependency order
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
bun run dev
```

## Common Commands

Every command that needs configuration runs under `varlock run`, which resolves the schema and
passes values as process environment. No command reads a `.env` file.

| Task | Command |
| --- | --- |
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

Local server scripts disable the job runner by default — the schema resolves
`RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER` to `true` outside production. Use a `*:jobs` command only
when the task requires schedules or background execution.

The direct server listens on port `8080` by default. Vite serves the website on its configured dev
port and proxies `/api` to the server. Use `dev-port` for new checkout-specific harnesses instead
of adding fixed ports. In non-production environments, the server accepts HTTP CORS origins from
loopback hosts on any port so checkout-specific website previews can use their assigned port.

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
