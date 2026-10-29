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

Keepa series use repeating timestamp/value pairs. A negative value means no offer or no rank at
that time and reads as `isMissing = true` with a null numeric value. Sparse points mean the observed
value did not change frequently; they do not imply that RankWrangler stopped collecting data.

## Storage Format

`product_history_series` holds one row per Product, source, metric and category. The row keeps the
whole series as two parallel `integer[]` columns: `keepa_minutes`, strictly ascending Keepa
minutes, and `keepa_values`, the value at each minute. A missing point keeps Keepa's negative
marker (`-1`).
`observedAt` is derived from the Keepa minute and is not stored. The composite primary key is the
only index; every read starts from a Product id, joined from `(marketplace_id, asin)` on
`products`.

`apps/server/src/services/keepa-history-series.ts` owns the encoding: building series from Keepa
pairs, decoding them to points, the bounded-window selection and the value-in-force lookup. The
history API, the sparkline sampler and the seed decode through it. Three aggregate reads stay in SQL
over `unnest(keepa_minutes, keepa_values)`, treating a negative value as missing: the improvement
share, the sparkline window, and best-ever rank.

A write merges each incoming series into the stored one inside `ON CONFLICT DO UPDATE`: the union of
points by minute, the incoming value winning a shared minute. A fetch with a shorter window never
erases older history, which matches the point-level upserts this table replaced, and the row lock
serializes concurrent writers. Saving a Product is one statement instead of thousands of upserts.

The format replaced `product_history_points`, one row per point with a UUID and three indexes:
about 2.4 MB per Product (20 GB for 8,647 Products in production). Two arrays cost 8 bytes per
point plus a small row; a synthetic Product with 6,600 points measured 63 KB with uniformly random
values against 2.9 MB exploded, about 46 times smaller; real values may compress further under
TOAST, which is unmeasured. Parallel arrays were chosen over Keepa's interleaved layout because SQL readers
`unnest(keepa_minutes, keepa_values)` directly and a merge needs no stride arithmetic.

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

## Read Lifecycle

The public read lifecycle and projection below are the accepted target. Stored observations and the
dashboard Operation workflow describe current behavior.

Public history reads ensure the canonical Product exists and apply the history capability's
freshness policy. Current stored coverage returns immediately. Missing or policy-expired coverage
joins or starts one pending Product-history Operation, waits for its durable worker, and reads the
completed history. A wider requested window does not bypass the global 24-hour Keepa success guard.

The Operation is unique while pending for a marketplace/ASIN. Successful history persistence and
successful Operation completion share one transaction. An exhausted provider failure completes
the same Operation with a sanitized error and leaves existing points intact. Workers no-op after
completion; startup and the minute recovery job redispatch stale pending receipts. Caller timeouts
detach from the coordinator without cancelling the durable worker.

The public Product-history response contains provider-neutral sales-rank and price series with a
resolved `interval`. Points are `[periodStart, valueAtPeriodEnd]`; summaries always exist with
nullable `first`, `latest`, `min`, and `max` values. Valid empty history has `points: []` and all
four summary values `null`. Price exposes minor-currency unit, currency code, points, and summary,
without a public scale. The response has no schema version, status, freshness, provider, or work
state. The dashboard app procedures retain their existing Operation response. pg-boss jobs,
provider queue rows, imports, and job executions remain internal.
