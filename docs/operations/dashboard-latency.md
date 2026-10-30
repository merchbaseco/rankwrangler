---
summary: Defines how to measure dashboard API and view-switch latency on production and where the time goes.
read_when:
  - the Explore or Keywords view feels slow, or a change may affect dashboard read latency
  - reading `Server-Timing` on API responses or profiling a dashboard query on production
---

# Dashboard Latency

## Benchmark

In a signed-in dashboard tab, paste [`scripts/dashboard-latency.js`](../../scripts/dashboard-latency.js)
into the console and run `await rwLatency()`. It times each default Explore and Keywords read and
switches between the two views, printing p50 and max per row. Compare runs from the same network,
a few minutes after a deploy (a fresh process has cold aggregate caches).

| Column | Meaning |
| --- | --- |
| `p50`, `max` | Browser wall time, including Cloudflare and the tunnel to the Mac mini. |
| `authP50` | Server time spent authorizing the request (`Server-Timing: auth`). |
| `serverP50` | Server time from request to response (`Server-Timing: total`). |

`adminStatus` does no work beyond authorization, so its wall time is the per-request floor.

## Where the time goes

- The server reaches PlanetScale over the WAN (about 20ms per round trip), so every sequential
  query costs a round trip on top of its execution time. Prefer one statement per read and run
  independent reads with `Promise.all`.
- Background jobs share the application pool and hold connections through multi-statement
  transactions. A growing `authP50` or `serverP50` with unchanged query plans means pool waits.
- Explore and Keywords facets are whole-set aggregates (seconds when cold). They are served
  stale-while-revalidate and fetched on their own requests, so they never hold up the grid.

## Profiling a query

Read-only `EXPLAIN (ANALYZE, BUFFERS)` against production follows
[Database Queries](database-queries.md). Capture the statement with the server's development query
logger, inline its parameters, and replace page-specific identifiers with a bounded subquery.
