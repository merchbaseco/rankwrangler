---
summary: Defines Keepa refresh eligibility, cadence, provider-capacity controls, queue diagnostics, and recovery checks.
read_when:
  - diagnosing stale Product history, Keepa queue growth, retries, or token exhaustion
  - changing scheduled Keepa cadence, eligibility, or provider-capacity policy
---

# Keepa Refresh Operations

**Status:** These source-separated freshness controls are implemented. Apply the generated
Product-schema migration before deployment.

Keepa refresh is Product-driven and requires standing history admission for scheduled work. `products.keepa_fetched_at` is the successful-fetch watermark;
import rows provide provenance and diagnostics but do not schedule refreshes.

## Cadence

| Product state | Scheduled cadence |
| --- | --- |
| Merch, root BSR below `300,000` | Daily |
| Merch, root BSR `300,000` through `999,999` | Weekly |
| Merch, root BSR at least `1,000,000` | On demand |
| Unknown classification or non-merch | Not scheduled |
| Merch with missing numeric BSR | Not scheduled |

Every caller shares a strict 24-hour minimum provider gap per marketplace/ASIN. Rich product,
history, and dashboard requests create or join durable on-demand work and cannot bypass that guard.
Public Product-history callers wait through the shared retrieval service and do not receive
Operation identifiers or provider-capacity details. The dashboard app keeps its existing
Operation-based refresh workflow.

The hourly cadence scan enqueues stale eligible Products. The queue dispatcher runs every minute,
checks for due work before refreshing provider capacity, and caps each batch. An idle dispatcher
tick makes no Keepa request; work becoming due after the preflight waits at most one dispatcher
interval. A queue row is unique by marketplace/ASIN. Failed work remains queued with bounded
exponential backoff.

## Diagnose

The admin Keepa metrics surface reports:

- provider token state and refill timing;
- queued and due work;
- recent fetch success and failure;
- computed process batch size;
- refresh-policy buckets and recent job executions.

Check these in order:

1. Confirm the Product is active, admitted, known Merch and has a numeric root-category BSR; `null` classification is
   not known non-Merch.
2. Compare `keepa_fetched_at` with its policy window and the global 24-hour guard.
3. Check whether a deduplicated queue row already exists and when it is next due.
4. Inspect recent enqueue, dispatch, and fetch executions in the activity/admin surfaces.
5. Check provider capacity before manually retrying work.

For a stranded client request, inspect its pending Operation. Undispatched or stale receipts are
redispatched at startup and by the one-minute recovery job; recovery keeps the same Operation id
and does not create another Product-history request.

Do not expose Keepa token accounting through public RankWrangler APIs. It is an internal provider
budget.

The admin-only collection status reports rolling allocations, unknown reserved spend, measured
costs, the interactive floor, history-admission pauses and keyword/exploration backlogs. A budget
deferral is not a provider failure and does not mark data fresh. See the protected-capacity policy
in the internals reference. Keepa retains its pilot ceilings; SP-API acquisition uses the separate
measured-rate budget described in [catalog search internals](../internals/catalog-search.md).

See [Keepa refresh internals](../internals/keepa-refresh.md) for data semantics and ownership.

## History series backfill

History moved from `product_history_points` (one row per point) to `product_history_series` (one
row per Product, metric and category). The rollout has three steps, each its own deploy or command:

1. Deploy the release with migration `0060_product_history_series`. It only creates the new table;
   from then on every Keepa save writes series and every read decodes them. The old table is left
   untouched and nothing writes to it.
2. Immediately after the deploy, convert existing history from the server directory of the deployed
   checkout:

   ```bash
   VARLOCK_ENV=production bun run --cwd apps/server history:backfill-series
   ```

   It works in bounded batches of 25 Products by Product id, each batch one atomic upsert, and logs
   `resume with --after <productId>`. Rerun with `-- --after <id>` after an interruption; a full
   rerun is also safe, because batches merge into existing series and a fresh Keepa fetch wins any
   minute it shares with the old points. It finishes by printing how many Products with points
   still lack series; that must be `0`. Until a Product's batch runs, its charts, sparklines and
   best-ever rank read empty; there is no fallback to the old table, so start the backfill right
   after the deploy rather than waiting for scheduled refetches to rebuild history.
3. In a later release, after the backfill reports `0`, remove `productHistoryPoints` from
   `apps/server/src/db/schema.ts` together with the backfill script and module, generate the drop
   migration, and deploy it. The drop cannot ship with step 1, because migrations run on deploy
   and would discard the old rows before the backfill reads them. The same change updates the
   preservation proofs that still count `product_history_points`
   (`src/scripts/central-auth-preservation-proof.ts`, `test/upgrade-collection-fixture.ts`).

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
