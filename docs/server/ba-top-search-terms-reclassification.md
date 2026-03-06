# BA Top Search Terms Reclassification

Use this runbook when the stored `top_search_terms_keyword_daily` rows need to be
reclassified against the current `classifyMerchKeyword()` logic without refetching BA reports.

This workflow is for one-off cleanup after filter changes.

## What The Script Does

Script:
`apps/server/src/scripts/reclassify-top-search-terms.ts`

The script:

- reads existing `top_search_terms_snapshots`
- re-runs `classifyMerchKeyword(searchTerm)` for each stored keyword row
- compares the stored `is_merch_relevant` / `merch_reason` values with the new classification
- in `--write` mode, updates:
  - `top_search_terms_keyword_daily.is_merch_relevant`
  - `top_search_terms_keyword_daily.merch_reason`
  - `top_search_terms_snapshots.keyword_count`

It does not refetch SP-API reports.

## Safety

Before using this workflow, read:

- `docs/database-queries.md`

Default to dry-runs first. Only use `--write` with explicit approval in the current conversation.

## Environment Setup

From repo root:

```bash
set -a
source .env
set +a
```

Run the script from `apps/server`.

## Dry-Run Commands

### Latest daily snapshot only

```bash
cd apps/server
bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --dry-run \
  --report-period=DAY \
  --snapshot-limit=1
```

### All daily snapshots

```bash
cd apps/server
bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --dry-run \
  --report-period=DAY
```

### Weekly sample

```bash
cd apps/server
bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --dry-run \
  --report-period=WEEK \
  --snapshot-limit=12
```

### Full weekly history

```bash
cd apps/server
bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --dry-run \
  --report-period=WEEK
```

Weekly history is much larger than daily history, so expect this to take materially longer.

## Recommended Rollout Order

1. Run daily dry-run.
2. Review the changed-term summary and manual review exports.
3. Run weekly sample dry-run.
4. If the weekly sample looks correct, run full weekly dry-run.
5. Apply writes in two phases:
   - `--write --report-period=DAY`
   - `--write --report-period=WEEK`

This keeps the faster, more user-visible daily cleanup separate from the larger weekly pass.

## Write Commands

### Daily write pass

```bash
cd apps/server
bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --write \
  --report-period=DAY
```

### Weekly write pass

```bash
cd apps/server
bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --write \
  --report-period=WEEK
```

## Post-Write Validation

Run these after each write pass.

### Snapshot totals

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT report_period, COUNT(*), SUM(keyword_count) FROM top_search_terms_snapshots GROUP BY 1 ORDER BY 1;"
```

### Latest daily snapshots

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT data_end_date, keyword_count, fetched_at FROM top_search_terms_snapshots WHERE report_period = 'DAY' ORDER BY data_end_date DESC LIMIT 10;"
```

### Spot-check newly blocked rows

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  \"SELECT data_end_date, search_term, merch_reason
   FROM top_search_terms_keyword_daily
   WHERE report_period = 'DAY'
     AND is_merch_relevant = false
   ORDER BY data_end_date DESC, search_frequency_rank ASC
   LIMIT 50;\"
```

## Notes

- The script is idempotent for repeated dry-runs.
- `--write` only changes rows whose stored classification differs from the current classifier output.
- If manual review finds false positives, tighten the filter and rerun dry-run before using `--write`.
