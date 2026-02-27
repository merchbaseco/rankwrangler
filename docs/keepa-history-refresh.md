# Keepa History Refresh

This document describes the automatic Keepa history refresh system used by the server.

## Keepa History Data Semantics (Important)

Keepa history arrays are event-based, not daily snapshots.

- Product `csv` arrays are encoded as repeating timestamp/value pairs (`[keepaMinute, value, ...]`).
- Keepa timestamps are "Keepa minutes" and must be converted to Unix time.
- For price series, `-1` means no offer at that timestamp (commonly out of stock).
- Rank and price history are both event-driven (change points), not fixed-interval snapshots.
- Keepa's "last history timestamp" means "last observed value/price change", not "last time Keepa checked the product".
- `days=X` limits returned history to recent X days, but does not create one point per day.

Practical consequences for RankWrangler:

- Large date windows can still have few points when a price/rank changed infrequently.
- History charts should be treated as step functions (value persists until next change), not linear interpolation between frequent samples.
- When querying a bounded date range, include the latest point before `startAt` so the chart can represent the value at range start.

Reference sources used for this behavior:

- Keepa backend SDK `Product.csv` docs and `CsvType` definitions:
  - <https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Product.java>
- Keepa backend SDK `ProductAnalyzer` semantics (`getLastTime`, `getValueAtTime`):
  - <https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/helper/ProductAnalyzer.java>
- Keepa backend SDK `Request.getProductRequest(... days ...)` semantics:
  - <https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Request.java>
- Keepa time conversion helper:
  - <https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/helper/KeepaTime.java>

## Eligibility

An ASIN is eligible for automatic Keepa refresh only when all conditions are true:

- Product is classified as merch (`is_merch_listing = true`)
- Product has a numeric root-category BSR
- `rootCategoryBsr < 300,000` => daily sync cadence
- `300,000 <= rootCategoryBsr < 1,000,000` => weekly sync cadence
- `rootCategoryBsr >= 1,000,000` => on-demand sync cadence via `getProductInfo`

Policy constants and dashboard labels are centralized in:

- `apps/server/src/services/keepa-refresh-policy.ts`

Eligibility is evaluated from the cached `products` table.

Plain-English behavior:

- Product lookup still stores SP-API category/BSR data for any category when available.
- Keepa enqueue from product lookup only happens for merch ASINs with a numeric BSR.
- Non-merch ASINs are never Keepa-enqueued.
- Merch ASINs with missing BSR are not Keepa-enqueued.
- Non-eligible ASINs can still load Keepa history manually (dashboard/extension history action).

## Global 24h Keepa Guard

All Keepa product history requests go through `loadKeepaProductHistory()` in
`apps/server/src/services/keepa.ts`.

That function enforces a strict rule:

- Never invoke Keepa for the same ASIN more than once per 24 hours.
- If a successful Keepa import exists within 24 hours, the existing payload is returned.
- The 24-hour boundary is time-exact (`>= 24h` elapsed can fetch again; `< 24h` cannot).

This applies equally to:

- Manual dashboard requests (`api.app.loadProductHistory`)
- Background refresh jobs

## Queueing Flow

Queue table: `keepa_history_refresh_queue`

- ASINs are queued from:
  - scheduled Keepa cadence scan (`enqueue-scheduled-keepa-history-refresh`) for `<1M` merch BSR,
  - product lookup flow (`fetchProductInfo`) for on-demand sync behavior.
- Manual history actions do not write to `keepa_history_refresh_queue`; they call the manual
  Keepa loader path directly.
- Queue insert is deduplicated by `(marketplace_id, asin)`.
- Queue insert is skipped when a successful Keepa import exists inside the policy window:
  - Daily bucket (`BSR < 300k`): last import newer than 24 hours
  - Weekly bucket (`300k <= BSR < 1M`): last import newer than 7 days
  - On-demand bucket (`BSR >= 1M`): last import newer than 24 hours

## Refresh Cadence

- Keepa cadence scan runs hourly and enqueues stale merch ASINs by BSR policy.
- Cadence uses BSR bucket policy:
  - `BSR < 300k`: automatic daily refresh
  - `300k <= BSR < 1M`: automatic weekly refresh
  - `BSR >= 1M`: on-demand from `getProductInfo`
- Background queue dispatch runs every 1 minute (`process-keepa-history-refresh-queue`).
- Keepa fetches are additionally guarded by a global 24-hour successful-import check in
  `loadKeepaProductHistory()`.
- The "30 days" value is the minimum incremental history window fetched once a refresh is triggered;
  it is not an automatic enqueue interval.

## Background Jobs

### `enqueue-scheduled-keepa-history-refresh`

- Triggered hourly.
- Scans merch products with numeric BSR and enqueues stale `<1M` ASINs.
- Daily stale threshold for `BSR < 300k`; weekly stale threshold for `300k <= BSR < 1M`.
- Uses insert dedupe keyed by `(marketplace_id, asin)` (existing queued ASINs are skipped).

### `process-keepa-history-refresh-queue`

- Triggered every minute as a singleton.
- Computes batch size from in-memory Keepa token state.
- Assumes 2 Keepa tokens per history fetch and caps dispatch to 10 jobs per run.
- Dispatches one `fetch-keepa-history-for-asin` job per ASIN.

### `fetch-keepa-history-for-asin`

- Performs one ASIN history refresh attempt.
- Uses `loadKeepaProductHistory()` (which enforces the 24h guard).
- First successful import fetches up to 3650 days.
- Follow-up imports use a rolling window based on staleness (minimum 30 days, with buffer).
- Removes the ASIN from queue after the attempt (success or failure).
- A future refresh requires a new enqueue trigger (product lookup flow or dashboard history modal).

## Manual Requests

- Dashboard history modal auto-requests Keepa sync when no Keepa import exists or the latest successful import is older than 48 hours.
- While that stale refresh is in-flight, the modal keeps rendering existing history points and swaps to new
  points after sync completion.
- Manual dashboard requests use high-priority Keepa queueing.
- HTTP request stays open for up to 2 minutes and retries on retryable Keepa failures.
- Retry policy uses exponential backoff within the 2-minute window.
- If retries never succeed within 2 minutes, API returns `TIMEOUT`.

## Token State

Keepa token state is tracked in-memory in `apps/server/src/services/keepa.ts` and updated from Keepa API responses.

When token state is stale (older than 1 minute), the server refreshes it from
Keepa `GET /token` before:

- Computing Keepa queue batch size
- Returning dashboard Keepa status

Exposed to dashboard via:

- `api.app.getKeepaStatus`

Returned fields include:

- `tokens.tokensLeft`
- `tokens.tokensConsumed`
- `tokens.refillInMs`
- `tokens.refillRate`
- `tokens.updatedAt`
- Queue metrics (`totalQueued`, `dueNow`, `fetchesLastHour`, `fetchesLastHourSuccess`, `fetchesLastHourError`, `processBatchSize`)
