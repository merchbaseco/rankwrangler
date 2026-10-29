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
current Product metrics, merged history series, import provenance, Product freshness, and
obsolete pending Keepa queue work atomically.

## Freshness Contract

`products.keepaFetchedAt` is the refresh-control watermark. It advances only after accepted
persistence. `keepaSourceUpdatedAt` is Keepa's own Product update time and does not control the
RankWrangler schedule.

Every Product load enforces a strict provider guard: the same marketplace and ASIN cannot invoke
Keepa again within 12 hours of a successful fetch. Concurrent loads within one server process join
one in-flight request, and freshness is checked again immediately before provider dispatch.

Import rows retain request, response, error, and token diagnostics. They do not decide when the
Product is stale.

## Automatic Eligibility

Automatic Keepa collection requires an admitted, active Product classified as Merch with a numeric BSR:

| Current root-category BSR | Schedule |
| --- | --- |
| Below 50,000 | Stale after 12 hours; automatic collection twice a day. |
| 50,000 through 299,999 | Stale after 24 hours; automatic daily collection. |
| 300,000 through 999,999 | Stale after seven days; automatic weekly collection. |
| 1,000,000 or higher | On demand only. |
| Missing BSR | No automatic Keepa collection. |
| Classification unknown or non-Merch | No automatic Keepa collection; unknown remains distinct from known non-Merch. |

The hourly candidate scan reads BSR and `keepaFetchedAt` directly from Products and excludes work
already in `keepa_history_refresh_queue`. The queue is unique by marketplace and ASIN.

## Dispatch And Retry

The queue processor runs every minute. It first checks the indexed queue for due work and does not
contact Keepa from an idle dispatcher tick. When work is due, it refreshes the in-memory Keepa
token snapshot when stale, derives a batch of up to one minute's refill (20 fetches on our plan, at
one token each), performs an authoritative due-row
selection, holds those rows, and dispatches one singleton fetch job per ASIN. Work becoming due
immediately after an empty preflight waits until the next minute. Provider token counts and refill
timing are internal capacity signals used by operational dashboard surfaces, never part of the
public API or CLI contract.

First successful collection requests up to 3,650 days. Later collections use a staleness-aware
window with a 30-day minimum and overlap buffer. Failed queue work remains with exponential retry
from five minutes up to 24 hours.

## On-Demand Loads

The public behavior below is the accepted target. Dashboard and provider-work mechanics remain
current.

Public Product and history reads coordinate through durable work internally. They receive
policy-current stored data immediately and wait transparently when policy requires collection. The
dashboard retains its existing source-aware and Operation-shaped contracts. The high-priority
worker calls the shared Keepa ingestion path rather than writing the scheduled queue. It can load
Products outside automatic BSR eligibility but still respects the 24-hour guard. Retryable provider
failures are exhausted in the worker, outside the initiating HTTP request.

## History admission

Migration 0040 locks Product writes, records a baseline receipt and admits every existing identity,
including unknown and non-Merch Products. Eligibility still applies at dispatch. New identities
start `notAdmitted`; receiving incidental history does not create a recurring subscription.

The minute admission job uses measured Product cost and observed refill rate. Forecast 12-hour,
daily and weekly obligations must stay below 90% of the daily refill; the rest covers live requests,
first-time history and keyword searches. Capacity pauses new
admissions without revoking existing admissions. Existing eligible history seven days overdue also
pauses new admissions; this conservative observation is not proof of a continuous seven-day deficit.
Explicit history reads remain available outside standing admission.

## Protected capacity

Every physical Keepa request reserves capacity durably just before dispatch. Errors, empty results
and ingestion failures retain their provider cost; missing accounting retains the reservation for
its rolling window. Provider attempts are independent of Product import success.

Interactive work (someone is waiting on it) is limited only by the physical bucket. While an
interactive attempt is open (created in the last five minutes and unsettled), every background class
yields. An interactive request short on tokens keeps its attempt open and retries every five seconds
for up to ninety, so background work cannot take the refill it is waiting for.

Keepa refills the bucket every minute and drops tokens older than an hour, so a full bucket wastes
its refill. Background work (history, keyword heads, discovery) may therefore spend the bucket down
to a live reserve, `keepa_capacity_state.live_reserve_tokens` (100 by default, about ten live keyword
searches); there are no hourly per-class shares. Change the reserve with one update of that column,
without a deploy, and raise it if live requests start waiting.
Initial caps are fifty head requests and twenty discovery requests per day,
with at most ten discovery requests per keyword per day. SP-API listing acquisition has a separate measured-rate budget; see [catalog search](catalog-search.md).
Unknown costs permit only bounded interactive measurements; background work waits for measurements.

Listing breadth comes from SP-API without enrolling every discovered Product in Keepa. Active Merch
Products without BSR and unknown classifications receive bounded SP-API probation and later cold
rechecks; known non-Merch and deleted Products do not enter an automatic blindspot sweep.
