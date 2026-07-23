---
summary: Defines stored Keepa rank and price change points, query formats, range behavior, and agent bucketing.
read_when:
  - changing Product history storage, range queries, chart semantics, or agent history responses
  - diagnosing sparse history, missing prices, carry-in values, or bucket selection
---

# Product History

Product history stores Keepa rank and price observations as change points. It is not a table of one
snapshot per calendar day.

## Stored Observations

Supported source metrics are main-category BSR, category BSR, Amazon price, new price, and new FBA
price. Each point is unique by Product, source, metric, category, and Keepa timestamp.

Keepa series use repeating timestamp/value pairs. A negative price value means no offer at that
time and is stored as `isMissing = true` with a null numeric value. Sparse points mean the observed
value did not change frequently; they do not imply that RankWrangler stopped collecting data.

## Range Semantics

A bounded query includes the latest point before `startAt` when available. Consumers can therefore
render the value in force at the start of the requested range. Charts and buckets treat history as
a step function rather than linearly interpolating between provider changes.

The shared Product-history service supports:

- raw point output for the dashboard;
- the legacy main-BSR response;
- agent output grouped into `day`, `week`, or `month` buckets.

`auto` chooses daily buckets through 45 days, weekly buckets through 18 months, then monthly
buckets. Price values use minor currency units.

## Read And Refresh Lifecycle

History reads ensure the canonical Product exists, read stored points, and return them without
waiting for Keepa. When coverage is missing and no recent successful import proves the range was
checked, the service persists or joins one pending Product-history Operation and dispatches its
worker. A wider requested window does not bypass the global 24-hour Keepa success guard.

The Operation is unique while pending for a marketplace/ASIN. Successful history persistence and
successful Operation completion share one transaction. An exhausted provider failure completes
the same Operation with a sanitized error and leaves existing points intact. Workers no-op after
completion; startup and the minute recovery job redispatch stale pending receipts.

Public and app Operation reads expose only `pending` or `completed`. Pending responses include
`retryAfterSeconds`; completion contains either a typed Product-history resource or a safe error.
pg-boss jobs, provider queue rows, imports, and job executions remain internal and distinct.
