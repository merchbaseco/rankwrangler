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
- Access the public Merchbase-credential surface from `rw` or `@rankwrangler/http-client`.
- Explore Keepa-backed Catalog searches in the dashboard and retain source-ordered evidence in
  durable Search runs.

Amazon [Catalog search](docs/product/catalog-search.md) returns source-ordered external
observations, reconciles Products into the canonical catalog, and retains the Search run without
creating an opaque recommendation engine.

Canonical Product retrieval is shared across blocking ASIN reads and background bulk workflows.
Catalog runs retain immutable search membership while their current Products resolve independently;
cached and fresh runs use the same background path. Product thumbnails report `pending`, `available`,
or `unavailable` without exposing provider-specific availability fields.

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
rw catalog query "retro gardening shirt"
rw catalog runs <queryId>
rw catalog run <runId>
```

Each catalog search request renews the keyword's 30-day active window, including cached reuse.
Active keywords receive automatic weekly refreshes; expired keywords become inactive without
backfill. Search history labels Requested search versus Automatic refresh.

Public Product-history reads return stored points immediately with a freshness envelope. When
collection is needed, the shared server retrieval service waits transparently for policy-compliant
history or returns a provider-neutral retryable error with a hint; the public response does not
expose Product-history Operation state. The dashboard retains its app-specific Operation workflow
and Clerk-authenticated completion subscriptions for Product history, Catalog search, and per-ASIN
SP-API Product synchronization. Product-sync events invalidate only the affected Product query;
they do not refetch a Catalog result list.

For programmatic access, use [`@rankwrangler/http-client`](packages/http-client/README.md). The
public API uses Merchbase API keys or OAuth credentials; dashboard procedures use Clerk sessions.

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
