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

Runs every 30 minutes and:

1. Ensures dataset rows exist for:
   - daily windows for the last 90 days
   - weekly windows (rolling backfill seed, retained indefinitely once inserted)
2. Prunes daily datasets older than the 90-day retention boundary.
3. Finds due datasets (`next_refresh_at <= now`, `refreshing = false`).
4. Enqueues fetch jobs and marks those datasets `queued`.

Constants live in `apps/server/src/services/top-search-terms-dataset-windows.ts`.

## Fetch Worker Job

File: `apps/server/src/jobs/fetch-top-search-terms-dataset.ts`

For each dataset:

1. Mark dataset `in_progress`.
2. Request/download BA report via SP-API in
   `apps/server/src/services/spapi/ba-keywords-service.ts`.
3. Parse + aggregate keywords in
   `apps/server/src/services/spapi/ba-keywords-aggregation.ts`.
4. Persist snapshot + keyword rows.
5. Mark dataset `completed` with computed `next_refresh_at`, or `failed` with retry backoff.

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

Current app procedures (names retained for compatibility):

- `api.app.searchTermsList`
- `api.app.searchTermsStatus`
- `api.app.searchTermsRefresh`

These now operate on `top_search_terms_*` datasets/snapshots.

## Operational Notes

- Startup enqueues one dataset-sync wakeup so coverage starts immediately.
- Scheduler/fetch queue integration is in
  `apps/server/src/services/top-search-terms-jobs.ts`.
- Parse diagnostics are logged per fetch (accepted/rejected counts, malformed row counts, etc.).

## Schema/Migration Notes

Schema is in `apps/server/src/db/top-search-terms-schema.ts`.

When changing schema:

1. Update schema source.
2. Run `bunx drizzle-kit generate` (do not hand-write migrations).
3. Keep `apps/server/init.sql` table commentary in sync.
