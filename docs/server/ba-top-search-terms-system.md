# BA Top Search Terms System

This doc explains the RankWrangler BA Top Search Terms ingestion system, including dataset tracking,
fetch orchestration, storage, and filtering policy.

## Why This Exists

We store BA Top Search Terms to preserve rank-over-time signal (`searchFrequencyRank`) and detect
seasonal ramps. This is a timing/prioritization layer, not a full keyword discovery system.

Reference: `docs/server/ba-top-search-terms-purpose.md`.

## High-Level Architecture

Top search terms ingestion is split into two jobs:

1. `sync-top-search-terms-datasets` (scheduler)
2. `fetch-top-search-terms-dataset` (dataset worker)

This mirrors a dataset metadata + status workflow (similar to BidBeacon) and avoids ad-hoc
window-based fetching.

## Dataset Model

Datasets represent concrete BA report windows and status.

- Table: `top_search_terms_datasets`
- Key columns:
  - `marketplace_id`
  - `report_period` (`DAY` or `WEEK`)
  - `data_start_date`
  - `data_end_date`
  - status fields (`status`, `refreshing`, `active_job_id`, `last_error`, `next_refresh_at`, ...)

Unique key is `(marketplace_id, report_period, data_start_date, data_end_date)`.

## Storage Model

- `top_search_terms_snapshots`: one persisted fetch result per dataset + observed day.
- `top_search_terms_keyword_daily`: normalized keyword rows for each snapshot.

`top_search_terms_keyword_daily` rows include filtered merch relevance fields:

- `is_merch_relevant`
- `merch_reason`

## Scheduler Job

File: `apps/server/src/jobs/sync-top-search-terms-datasets.ts`

Runs every 5 minutes and:

1. Ensures dataset rows exist for:
   - daily windows for the last 90 days
   - weekly windows (Sunday-Saturday boundaries, rolling backfill seed, retained indefinitely once inserted)
2. Prunes daily datasets older than the 90-day retention boundary.
3. Finds due datasets (`next_refresh_at <= now`) where either:
   - `refreshing = false`, or
   - `refreshing = true` but `active_job_requested_at` is stale beyond job expiry + grace (timeout
     recovery path).
   Due datasets are ordered by earliest `next_refresh_at` first.
4. Enqueues fetch jobs and marks those datasets `queued`.

Throughput guardrail:

- Scheduler enqueues at most five due datasets per run (`TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE = 5`)
  to improve backlog drain without introducing bursty BA backfill pressure.

`next_refresh_at` is SLA-aligned for open windows instead of immediate:

- Daily non-Saturday periods: first refresh is scheduled at the 72-hour BA availability boundary
  (Pacific end-of-day `D+3` for dataset day `D`).
- Saturday daily periods and weekly periods: first refresh is scheduled at the 48-hour BA
  availability boundary (Pacific end-of-day `D+2`).
- The scheduler also reconciles existing idle dataset rows to pull forward stale future
  `next_refresh_at` values when SLA timing changes.

Constants live in `apps/server/src/services/top-search-terms-dataset-windows.ts`.

## Fetch Worker Job

File: `apps/server/src/jobs/fetch-top-search-terms-dataset.ts`

For each dataset:

1. Mark dataset `in_progress`.
2. If `report_id` is empty, request a BA report and persist `report_id` on the dataset.
3. Set `next_refresh_at` to 15 minutes later and release the row (do not block-wait).
4. On the next due run, check report status for the persisted `report_id`.
5. If report has been pending longer than 3 hours, fail and clear `report_id` so retries request
   fresh.
6. If still not ready, push `next_refresh_at` another 15 minutes.
7. If terminal (`FATAL`/`CANCELLED`), fail and clear `report_id` so retries can request fresh.
8. If `DONE`, download + parse report in
   `apps/server/src/services/spapi/ba-keywords-aggregation.ts`.
9. Persist snapshot + keyword rows.
10. Mark dataset `completed`, clear `report_id`, and compute the next SLA refresh.

Concurrency guardrail:

- Fetch jobs are sent with a shared pg-boss group id and worker `groupConcurrency = 1`, so only one
  BA report fetch runs at a time across all server instances.
- Fetch jobs set `expireInSeconds = 900` to align with the next-best-action flow and prevent
  long-running active workers from blocking queue throughput.
- Async BA polling uses 15-minute status checks between runs instead of in-job busy polling.
- Transient SP-API failures (rate-limit/network/5xx) are retried with exponential backoff before a
  final dataset failure is recorded.
- SDK built-in report API rate limiting is disabled for this path so requests wait in our Bottleneck
  queue instead of being dropped.

## Report Periods

- Supported periods: `DAY`, `WEEK`.
- Legacy API input `MONTH` is normalized to `WEEK` for compatibility.
- Current UI defaults to `DAY`.

## Filtering/Classification Policy

Classifier entry point:
`classifyMerchKeyword(searchTerm)` in
`apps/server/src/services/spapi/ba-keywords-aggregation.ts`.

Key policy points:

- Keep broad intent signals like `gift` and `school`.
- Keep strong product-type/apparel signals.
- Block commodity/non-PoD and card/code noise (`gift card`, `ecard`, `digital code`, etc.).
- Keep scoped seasonal exclusions to avoid overblocking.
- Keep explicit exception: `pajamas` / `pjs`.
- Do not depend on BA category/department fields for gating.

Signal definitions live in `apps/server/src/services/spapi/ba-keyword-signals.ts`.

## API Surface

Current app procedures:

- `api.app.searchterms.list`
- `api.app.searchterms.status`
- `api.app.searchterms.refresh`
- `api.app.searchterms.trend`

These now operate on `top_search_terms_*` datasets/snapshots.

## Operational Notes

- Startup enqueues one dataset-sync wakeup so coverage starts immediately.
- Startup also reconciles stale active dataset rows (older than job expiry + grace) to recover from
  deploy-time interruptions.
- Scheduler/fetch queue integration is in
  `apps/server/src/services/top-search-terms-jobs.ts`.
- Parse diagnostics are logged per fetch (accepted/rejected counts, malformed row counts, etc.).

## Schema/Migration Notes

Schema is in `apps/server/src/db/top-search-terms-schema.ts`.

When changing schema:

1. Update schema source.
2. Run `bunx drizzle-kit generate` (do not hand-write migrations).
3. Keep `apps/server/init.sql` table commentary in sync.
