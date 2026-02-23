# Keepa History Refresh

This document describes the automatic Keepa history refresh system used by the server.

## Eligibility

An ASIN is eligible for automatic Keepa refresh only when all conditions are true:

- Product is classified as merch (`is_merch_listing = true`)
- Product has a numeric root-category BSR
- `rootCategoryBsr < 1,000,000`

Policy constants and dashboard labels are centralized in:

- `apps/server/src/services/keepa-refresh-policy.ts`

Eligibility is evaluated from the cached `products` table.

Plain-English behavior:

- Product lookup still stores SP-API category/BSR data for any category when available.
- Automatic Keepa enqueue only happens for eligible merch ASINs.
- Non-eligible ASINs (non-merch, missing BSR, or BSR >= 1,000,000) are not auto-enqueued.
- Non-eligible ASINs can still load Keepa history manually (dashboard/extension history action).

## Global 24h Keepa Guard

All Keepa product history requests go through `loadKeepaProductHistory()` in
`apps/server/src/services/keepa.ts`.

That function enforces a strict rule:

- Never invoke Keepa for the same ASIN more than once per 24 hours.
- If a successful Keepa import exists within 24 hours, the existing payload is returned.

This applies equally to:

- Manual dashboard requests (`api.app.loadProductHistory`)
- Background refresh jobs

## Queueing Flow

Queue table: `keepa_history_refresh_queue`

- ASINs are queued from product lookup flow (`fetchProductInfo`) after cache hit or fresh ingest completion.
- Queue insert is deduplicated by `(marketplace_id, asin)`.
- Queue insert is skipped if a Keepa import exists in the last 48 hours.

## Refresh Cadence

- There is no standalone "every N days" Keepa enqueue cron.
- Auto enqueue is event-driven from product lookup flow and requires eligibility.
- Even when eligible, enqueue is skipped when a successful Keepa import exists in the last 48 hours.
- Background queue dispatch runs every 1 minute (`process-keepa-history-refresh-queue`).
- Keepa fetches are additionally guarded by a global 24-hour successful-import check in
  `loadKeepaProductHistory()`.
- The "30 days" value is the minimum incremental history window fetched once a refresh is triggered;
  it is not an automatic enqueue interval.

## Background Jobs

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
