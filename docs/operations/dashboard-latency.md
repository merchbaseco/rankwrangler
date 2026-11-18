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
- System Status and history admission read stored counts (`product_stats`, Keepa measured costs)
  instead of counting Products or import history, so the 30-second Status poll costs a few rows.
- Explore's default view reads its facets from a snapshot the `refresh-product-search-facets` job
  counts exactly every fifteen minutes. A filtered view counts exactly only when an index finds at
  most 20,000 matches, and otherwise scales its counts from a fixed 4,000-page block sample, so no
  facet request reads more than that; results are served stale-while-revalidate on their own
  requests, so they never hold up the grid. Totals count only when an index or dense matches stop
  the count early, and use the planner estimate otherwise.
  Keywords reads scan the small `keyword_directory` projection instead of joining every keyword's
  pass and Products ([Keyword mining](../internals/keyword-mining.md)), so they stay well under a
  second warm; never add a per-keyword lateral over the whole set to them.
- The Product page's brand count stops at 1,000 through the brand-key index, and its best-ever rank
  reads the stored `lowest_point` of the main BSR series, not the series itself.
- The Product page opens on five reads that start together; each resolves the variant family inside
  its own statement or alongside its other reads, so none runs more than three sequential round
  trips. A row or Top 10 block the pointer rests on prefetches them, so a page opened from Explore
  renders from cache, and the same-niche search waits until the page's own reads have landed.

## Profiling a query

Read-only `EXPLAIN (ANALYZE, BUFFERS)` against production follows
[Database Queries](database-queries.md). Capture the statement with the server's development query
logger, inline its parameters, and replace page-specific identifiers with a bounded subquery.
