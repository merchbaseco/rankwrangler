# Keepa History Refresh

This document describes the automatic Keepa history refresh system used by the server.

## Eligibility

An ASIN is eligible for automatic Keepa refresh only when all conditions are true:

- Product is in root category `Clothing, Shoes & Jewelry` (`7141123011`)
- Product has a numeric root-category BSR
- `rootCategoryBsr < 1,000,000`

Eligibility is evaluated from the cached `products` table.

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
- Queue insert is skipped if a Keepa import exists in the last 24 hours.

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
- On success, schedules next attempt for 24 hours later.
- On failure, records error and schedules retry with exponential backoff (also considering Keepa refill delay).

## Manual Requests

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
