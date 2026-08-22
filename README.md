# RankWrangler

RankWrangler is an Amazon product intelligence catalog for Merch sellers, automation, and agents.
It collects source-attributed Product data, preserves rank and price history, exposes search-term
datasets, and makes the same canonical records available through a dashboard, browser extension,
CLI, and typed API.

RankWrangler provides inspectable data and primitives. It does not hide the catalog behind a
magical "find opportunities" score.

## Capabilities

- Browse and filter canonical Products by title, brand, ASIN, marketplace, BSR, freshness, and
  classified niche in the dashboard.
- Load the provider-neutral current Product and compact event-based BSR/price history sourced from
  Amazon SP-API and Keepa.
- Explore Amazon Brand Analytics Top Search Terms across daily, weekly, and custom windows.
- Discover Products while browsing Amazon with the Chrome or Safari extension.
- Inspect structured activity, provider health, and bounded raw Provider-attempt telemetry through
  admin surfaces.
- Access the public Merchbase-credential surface from `rw` or `@rankwrangler/http-client`.
- Explore Keepa-backed Catalog searches in the dashboard and retain source-ordered evidence in
  durable Search runs.

Amazon [Catalog search](docs/product/catalog-search.md) returns source-ordered external
observations, reconciles Products into the canonical catalog, and retains the Search run without
creating an opaque recommendation engine.

Canonical Product retrieval is shared across blocking ASIN reads and background bulk workflows.
The public `product.getMany` procedure resolves up to 200 unique marketplace/ASIN pairs into compact
fixed-shape title, thumbnail, and `amazonListingStatus` results, persists every identity, and batches
cold SP-API work by marketplace. Status is `active` while the detail-page listing exists and
`deleted` when Amazon has effectively removed it; RankWrangler retains last-known listing values.
Catalog runs retain immutable search membership while their current Products resolve independently;
cached and fresh runs use the same background path. Dashboard and internal Product records may retain
`pending`, `available`, or `unavailable` thumbnail state; public Product reads resolve that to
`available` or `unavailable`. Product `isMerchListing` is nullable knowledge: `null` means unknown,
distinct from known non-Merch (`false`).

## Use RankWrangler

The authenticated dashboard is served at
[rankwrangler.merchbase.co](https://rankwrangler.merchbase.co).

Install the CLI:

```bash
npm install -g @rankwrangler/cli
rw auth set
rw product get B0XXXXXXXX
rw product get B0XXXXXXXX B0YYYYYYYY
rw product search "retro gardening shirt"
rw product history B0XXXXXXXX --metrics salesRank,price --bucket auto
rw keyword get "retro gardening shirt"
rw keyword search "retro gardening"
rw keyword history "retro gardening shirt"
```

Each catalog search request renews the keyword's 30-day active window, including cached reuse.
Active keywords receive automatic weekly refreshes; expired keywords become inactive without
backfill. Search history labels Requested search versus Automatic refresh.

Public Product get/getMany/history and keyword reads return final policy-current data without
freshness envelopes or refresh controls. Product Search retains its separate search contract. When
collection is needed, the shared server retrieval service waits transparently for policy-compliant
data or returns a provider-neutral retryable error with a hint. Public callers never receive
Operation identifiers or polling state. The dashboard retains its app-specific workflow and
Clerk-authenticated completion subscriptions for internal Product history, Catalog search, and
per-ASIN SP-API Product synchronization.

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
RANKWRANGLER_DATABASE_HOST=localhost RANKWRANGLER_DATABASE_PORT=5433 bun run dev
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
