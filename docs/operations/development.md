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
cp .env.example .env
```

Populate the root `.env`; never commit it. New server variables belong in both
`apps/server/src/config/env.ts` and `.env.example`.

The example environment uses the Compose hostname `postgres`. For host-run development, start the
database container and override that connection:

```bash
docker compose --env-file .env -f apps/server/compose.yml up -d postgres
DATABASE_HOST=localhost DATABASE_PORT=5433 bun run dev
```

## Common Commands

| Task | Command |
| --- | --- |
| Server and website | `DATABASE_HOST=localhost DATABASE_PORT=5433 bun run dev` |
| Server only | `DATABASE_HOST=localhost DATABASE_PORT=5433 bun run server:dev` |
| Server and website with job workers | `bun run dev:jobs` |
| Server only with job workers | `bun run server:dev:jobs` |
| Server build | `bun run server:build` |
| Website build | `bun run website:build` |
| Extension build | `bun run extension:build` |
| CLI build | `bun run cli:build` |
| CLI end-to-end tests | `bun run cli:test:e2e` |
| Documentation routes | `bun run docs:list` |

Local server scripts disable the job runner by default. Use a `*:jobs` command only when the task
requires schedules or background execution; apply the same host database overrides.

The direct server listens on port `8080` by default. Vite serves the website on its configured dev
port and proxies `/api` to the server. Use `dev-port` for new checkout-specific harnesses instead
of adding fixed ports.

## Docker Development

From the repository root:

```bash
docker compose --env-file .env -f apps/server/compose.yml up --build
```

The Caddy entrypoint is `http://localhost:8090`; PostgreSQL binds to
`127.0.0.1:5433`. When running Compose from `apps/server`, the root environment file is
`../../.env`.

## Focused Checks

- Server/API changes: build the server and run the affected Bun tests.
- Website changes: build the website and exercise the changed path.
- Extension changes: build the extension; use [Extension preview](extension-preview.md) for UI.
- Public API or CLI changes: rebuild generated client types before CLI verification.
- Documentation changes: run `bun run docs:list` and validate local links.

If a fresh extension build cannot resolve `@rankwrangler/http-client`, run the root install and
then `bun run extension:build`; the extension build prepares its workspace dependency.
