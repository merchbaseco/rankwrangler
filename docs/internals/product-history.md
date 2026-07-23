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

History reads ensure the canonical Product exists first. When requested history is missing and no
recent successful Keepa import proves the range was checked, the current service performs an
on-demand Keepa load and reads the persisted points again. A wider requested window does not bypass
the global 24-hour Keepa success guard.

The rich Product read returns summary data even when history fails, with `status: partial` and a
structured history error. Existing dashboard points remain usable while a stale manual refresh is
in progress.

Durable asynchronous Product-history Operations are accepted target behavior; see
[Realtime events](realtime-events.md). The shipped manual loader can still retry inside an HTTP
request for up to two minutes.
