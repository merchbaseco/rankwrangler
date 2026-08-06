---
summary: Defines Keepa refresh eligibility, cadence, provider-capacity controls, queue diagnostics, and recovery checks.
read_when:
  - diagnosing stale Product history, Keepa queue growth, retries, or token exhaustion
  - changing scheduled Keepa cadence, eligibility, or provider-capacity policy
---

# Keepa Refresh Operations

**Status:** These source-separated freshness controls are implemented. Apply the generated
Product-schema migration before deployment.

Keepa refresh is Product-driven. `products.keepa_fetched_at` is the successful-fetch watermark;
import rows provide provenance and diagnostics but do not schedule refreshes.

## Cadence

| Product state | Scheduled cadence |
| --- | --- |
| Merch, root BSR below `300,000` | Daily |
| Merch, root BSR `300,000` through `999,999` | Weekly |
| Merch, root BSR at least `1,000,000` | On demand |
| Non-merch or missing numeric BSR | Not scheduled |

Every caller shares a strict 24-hour minimum provider gap per marketplace/ASIN. Rich product,
history, and dashboard requests create or join durable on-demand work and cannot bypass that guard.
Public Product-history callers wait through the shared retrieval service and do not receive
Operation identifiers or provider-capacity details. The dashboard app keeps its existing
Operation-based refresh workflow.

The hourly cadence scan enqueues stale eligible Products. The queue dispatcher runs every minute,
sizes work from available Keepa capacity, and caps each batch. A queue row is unique by
marketplace/ASIN. Failed work remains queued with bounded exponential backoff.

## Diagnose

The admin Keepa metrics surface reports:

- provider token state and refill timing;
- queued and due work;
- recent fetch success and failure;
- computed process batch size;
- refresh-policy buckets and recent job executions.

Check these in order:

1. Confirm the Product is Merch and has a numeric root-category BSR.
2. Compare `keepa_fetched_at` with its policy window and the global 24-hour guard.
3. Check whether a deduplicated queue row already exists and when it is next due.
4. Inspect recent enqueue, dispatch, and fetch executions in the activity/admin surfaces.
5. Check provider capacity before manually retrying work.

For a stranded client request, inspect its pending Operation. Undispatched or stale receipts are
redispatched at startup and by the one-minute recovery job; recovery keeps the same Operation id
and does not create another Product-history request.

Do not expose Keepa token accounting through public RankWrangler APIs. It is an internal provider
budget.

Shared Keepa capacity orders interactive Catalog search before scheduled Catalog search, and
scheduled Catalog search before Product refresh work.

See [Keepa refresh internals](../internals/keepa-refresh.md) for data semantics and ownership.

## Catalog search live smoke

Routine Catalog tests replay the sanitized fixture under
`apps/server/test/fixtures/keepa-catalog-search/`. To deliberately validate the live Product
Search boundary and print token consumption:

```bash
RUN_LIVE_KEEPA_CATALOG_SEARCH=1 \
  bun run --filter @rankwrangler/server test:keepa-catalog-live
```

Add `--record` to replace the fixed sanitized recording after inspecting the reported internal
consumption. The script refuses CI, uses one fixed first-page query, requests histories and
statistics in that single call, and never follows up per ASIN.
