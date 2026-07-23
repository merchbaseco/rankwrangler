---
summary: Defines shared Keepa Product ingestion, freshness guards, automatic eligibility, queueing, and provider-capacity handling.
read_when:
  - changing Keepa normalization, Product freshness, token handling, refresh cadence, or queue retries
  - diagnosing why an ASIN did or did not call Keepa
---

# Keepa Refresh

**Status:** The source-separated Keepa ingestion path and its Product-schema migration are
implemented. The migration must be applied before deployment.

All Keepa Product loads use one normalization and persistence path. A successful payload updates
current Product metrics, deduplicated history points, import provenance, Product freshness, and
obsolete pending Keepa queue work atomically.

## Freshness Contract

`products.keepaFetchedAt` is the refresh-control watermark. It advances only after accepted
persistence. `keepaSourceUpdatedAt` is Keepa's own Product update time and does not control the
RankWrangler schedule.

Every Product load enforces a strict provider guard: the same marketplace and ASIN cannot invoke
Keepa again within 24 hours of a successful fetch. Concurrent loads within one server process join
one in-flight request, and freshness is checked again immediately before provider dispatch.

Import rows retain request, response, error, and token diagnostics. They do not decide when the
Product is stale.

## Automatic Eligibility

Automatic Keepa collection applies only to Products classified as Merch with a numeric BSR:

| Current root-category BSR | Schedule |
| --- | --- |
| Below 300,000 | Stale after 24 hours; automatic daily collection. |
| 300,000 through 999,999 | Stale after seven days; automatic weekly collection. |
| 1,000,000 or higher | On demand only. |
| Missing BSR or non-Merch | No automatic Keepa collection. |

The hourly candidate scan reads BSR and `keepaFetchedAt` directly from Products and excludes work
already in `keepa_history_refresh_queue`. The queue is unique by marketplace and ASIN.

## Dispatch And Retry

The queue processor runs every minute. It refreshes the in-memory Keepa token snapshot when stale,
derives a bounded batch size, holds selected rows, and dispatches one singleton fetch job per ASIN.
Provider token counts and refill timing are internal capacity signals used by operational dashboard
surfaces, never part of the public API or CLI contract.

First successful collection requests up to 3,650 days. Later collections use a staleness-aware
window with a 30-day minimum and overlap buffer. Failed queue work remains with exponential retry
from five minutes up to 24 hours.

## On-Demand Loads

Rich Product reads, history reads, and dashboard manual refresh persist a Product-history
Operation and return stored points immediately. Its high-priority worker calls the shared Keepa
ingestion path rather than writing the scheduled queue. It can load Products outside automatic BSR
eligibility but still respects the 24-hour guard. Retryable provider failures are exhausted in the
worker, outside the initiating HTTP request.
