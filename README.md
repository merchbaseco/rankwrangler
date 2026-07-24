# RankWrangler

RankWrangler is an Amazon product intelligence catalog for Merch sellers, automation, and agents.
It collects source-attributed Product data, preserves rank and price history, exposes search-term
datasets, and makes the same canonical records available through a dashboard, browser extension,
CLI, and typed API.

RankWrangler provides inspectable data and primitives. It does not hide the catalog behind a
magical "find opportunities" score.

## Capabilities

- Browse and filter canonical Products by title, brand, ASIN, marketplace, BSR, freshness, and
  classified niche.
- Load Product summaries and event-based BSR/price history sourced from Amazon SP-API and Keepa.
- Explore Amazon Brand Analytics Top Search Terms across daily, weekly, and custom windows.
- Discover Products while browsing Amazon with the Chrome or Safari extension.
- Inspect structured activity and provider health from the operator dashboard.
- Access the public license-authenticated surface from `rw` or `@rankwrangler/http-client`.
- Run a Keepa-backed Catalog search and retain its source-ordered evidence in durable Search runs.

Amazon [Catalog search](docs/product/catalog-search.md) returns source-ordered external
observations, reconciles Products into the canonical catalog, and retains the Search run without
creating an opaque recommendation engine.

## Use RankWrangler

The authenticated dashboard is served at
[rankwrangler.merchbase.co](https://rankwrangler.merchbase.co).

Install the CLI:

```bash
npm install -g @rankwrangler/cli
rw auth set
rw products summary B0XXXXXXXX
rw products history B0XXXXXXXX --metrics bsr,price --bucket auto
rw operations get <operationId>
rw catalog search "retro gardening shirt"
rw catalog run <runId>
```

History reads return stored points immediately. When collection is needed, the response includes a
pending durable Operation; poll that receipt, then read history again after completion. The
dashboard also uses a Clerk-authenticated Product-history completion subscription as a low-latency
invalidation hint while polling remains the fallback.

For programmatic access, use [`@rankwrangler/http-client`](packages/http-client/README.md). The
public API uses license keys; dashboard procedures use Clerk sessions.

## Repository

| Path | Ownership |
| --- | --- |
| `apps/server` | Fastify/tRPC API, PostgreSQL/Drizzle persistence, providers, jobs, and events. |
| `apps/website` | Clerk-authenticated catalog and operator dashboard. |
| `apps/extension` | Chrome and Safari Amazon-page observation and Product UI. |
| `packages/cli` | Agent- and automation-friendly `rw` commands. |
| `packages/http-client` | Typed public tRPC client and API types. |
| `packages/history-chart` | Shared Product-history visualization. |

## Develop

```bash
bun install --frozen-lockfile
cp .env.example .env
# Fill in provider/auth credentials, then start PostgreSQL.
docker compose --env-file .env -f apps/server/compose.yml up -d postgres
DATABASE_HOST=localhost DATABASE_PORT=5433 bun run dev
```

Local app servers leave background workers disabled by default. Use `bun run dev:jobs` only when
the task requires schedules or queue execution.

Useful checks:

```bash
bun run server:build
bun run website:build
bun run extension:build
bun run cli:test:e2e
bun run docs:list
```

Start with the [documentation index](docs/README.md). The [domain glossary](CONTEXT.md) defines
Product, observation, history, catalog query, search run, and search result. Operational setup,
deployment, releases, and recovery live under [operations](docs/operations/README.md).
