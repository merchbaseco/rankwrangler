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
rw product get B0XXXXXXXX --shortName
rw product get B0XXXXXXXX B0YYYYYYYY
rw product search "retro gardening shirt"
rw product history B0XXXXXXXX --metrics salesRank,price --bucket auto
rw keyword get "retro gardening shirt"
rw keyword search "retro gardening"
```

Explicit `keyword.results` requests renew a 30-day research lease, including cached reuse.
General catalog searches record interest. Background checks adapt to demand and observed change;
continuous SP-API acquisition expands through user searches, relevant demand terms and once-per-product
Amazon Ads keyword recommendations
without buying history for every discovery. Shared physical-request capacity protects foreground reads;
Keepa head/history admission stays separate.
Capacity-limited keyword checks retain a retry time without recording a provider failure or a
successful observation. Freshness health allows that retry and its scheduler grace; actual provider
failures and abandoned retries still report unhealthy collection.

Public Product get/getMany/history and keyword reads return final policy-current data without
freshness envelopes or refresh controls. Product Search retains its separate search contract. When
collection is needed, Product get/getMany return a known Product's last-known listing while a
background refresh runs; otherwise the shared server retrieval service waits transparently for policy-compliant
data or returns a provider-neutral retryable error with a hint. Public callers never receive
Operation identifiers or polling state. The dashboard retains its app-specific workflow and
Clerk-authenticated completion subscriptions for internal Product history, Catalog search, and
per-ASIN SP-API Product synchronization.

Single-Product `get` accepts `include: ['marketData', 'shortName', 'cutoutThumbnail']`. Its default includes
`marketData`, preserving the existing Keepa-backed current Product read. Clients can omit it for a
listing-only read or add `shortName` for a design-specific label and `cutoutThumbnail` for a
centered transparent Product photo on a 128×128 canvas. Only requested derivatives are stored;
unchanged source inputs reuse durable results. `get` waits up to 20 seconds for requested
enrichment and returns a field still generating (or recently failed) as none rather than an error,
while generation continues for the next request. `getMany` returns basic listing fields only and
accepts no `include`. Batch reads and the extension do not trigger image analysis.

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
# No .env step: the committed .env.schema is the environment contract and
# varlock resolves every value, authorizing through the 1Password desktop app.
bun run --filter @rankwrangler/server exec docker compose -f compose.yml up -d postgres
bun run db:seed:dev   # synthetic recent week, local databases only
bun run dev
```

`http://localhost:5173` signs itself in outside production, as the shared Dev Sign-In user the seed
grants access to. The seed is what makes that user readable at all: development gets no Clerk
webhooks, so an unseeded database authorizes nobody and the dashboard reports every read as
unauthorized.

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

For the Cloudflare-billed PlanetScale migration, follow the
[restore and preservation runbook](docs/operations/planetscale.md). Local development uses PostgreSQL in Compose; production deploys use the PlanetScale Compose override.

## Merch database work

The [research plan](plans/merch-research.md) separates immediate catalog search from scheduled
keyword collection. The shared database query, dashboard, public API, CLI and MCP changes are
deployed as the initial research/collection pilot. `keyword.results` preserves dated external
search evidence. Search directly tracks its exact keyword for background SP-API checks; paid Keepa admission stays separate.
Adaptive Keepa collection tiers, durable token reservations and explicit history admission are live.
The [growth completion](plans/merch-growth-completion.md) adds independent continuous SP-API
acquisition, once-per-ASIN Ads keyword mining, once-per-tracked-keyword autocomplete, cached Jev
judgments, a live keyword directory with plain statuses, processing order, pause/resume and lifecycle logs, and adaptive keyword standing; it is locally verified and
awaits deployment. Operator settings expose collection
backlogs and capacity. The [execution record](plans/merch-collection-execution.md) tracks verification.
The [capacity baseline](plans/merch-capacity-baseline.md) records the initial pilot envelope.
