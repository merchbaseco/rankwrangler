---
summary: Defines safe dry-run, write, and validation steps for reclassifying stored Top Search Terms without refetching SP-API reports.
read_when:
  - changing Merch keyword classification and evaluating stored Top Search Terms
  - preparing an approved reclassification write for daily or weekly snapshots
---

# Search-Term Reclassification

`apps/server/src/scripts/reclassify-top-search-terms.ts` reapplies the current Merch keyword
classifier to stored snapshots. It updates changed keyword classifications and snapshot counts;
it does not refetch SP-API reports.

Database writes require explicit approval. Start with dry-runs.

## Dry Run

```bash
set -a
source .env
set +a
cd apps/server

bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --dry-run --report-period=DAY

bunx tsx src/scripts/reclassify-top-search-terms.ts \
  --dry-run --report-period=WEEK --snapshot-limit=12
```

Review changed-term summaries and manual-review output. Weekly history is larger; validate a sample
before a full pass.

## Approved Write

Run daily and weekly writes separately:

```bash
bunx tsx src/scripts/reclassify-top-search-terms.ts --write --report-period=DAY
bunx tsx src/scripts/reclassify-top-search-terms.ts --write --report-period=WEEK
```

After each pass, compare snapshot counts and keyword totals by `report_period`, then inspect recent
changed rows. The script is idempotent and only writes rows whose stored classification differs
from current logic.

If review finds false positives, change the classifier and repeat the dry-run before writing.
