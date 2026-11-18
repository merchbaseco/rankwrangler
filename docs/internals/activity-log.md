---
summary: Defines persisted domain activity events, their status and identity fields, query behavior, and separation from job logs.
read_when:
  - adding a customer-visible event action or changing activity-log filters and status semantics
  - deciding whether information belongs in event logs, job executions, or canonical domain state
---

# Activity Log

The activity log is a searchable, persisted timeline of meaningful Product, history, job, and
system outcomes. The dashboard reads it through a Cloudflare-authenticated paginated query.

## Event Shape

Events carry a domain action and outcome plus optional Product, marketplace, job-run, and request
correlation. One action name represents one operation; outcome belongs in status rather than a
second action family. The [Events reference](../reference/events.md) owns exact fields, enums, and
current action names.

## Query Contract

The list query uses stable cursor pagination and can filter by level, status, primitive type,
action, ASIN, marketplace, or job run. Free-text search covers message and common identity fields.
The current account scope is the global RankWrangler corpus.

Account, time floor, type, ASIN and job run walk an `(account_id, X, occurred_at)` index newest
first. Level, status, action, marketplace and text are checked row by row over at most 10,000 of
those rows per page (`EVENT_LOG_SCAN_ROWS`), so a rare match never walks the table: a page can come
back short, even empty, with a `nextCursor` that continues from the last row examined. There is no
text index; a trigram index would add a GIN insert to every one of about 170,000 events a day and
still could not bound a common word, which matches most rows.

## Histogram

The Status histogram reads `event_log_counts`: event counts per bucket (minute rows for the hour
range, half-hour rows for the day and week) by account, type, level and status. The
`fold-event-log-counts` job recounts them every minute from raw events, starting 15 minutes behind
its watermark (`event_log_count_state.folded_through`) so events whose transactions commit late are
still counted, and writes only counts that changed. Writers therefore take no extra lock: an
upsert in their transactions would serialize the keyword workers on the current minute's row.
Reads take the folded rows up to the watermark and count the raw events after it. Text, action,
ASIN, marketplace and job-run filters count raw events. Either way a histogram reads at most
50,000 raw events, newest first; when that bound stops it, `coveredFrom` says where counting began.
The header total is the histogram's sum. While live, the dashboard refreshes the list at most once
a second and the histogram at most every fifteen seconds.

## Retention

`prune-event-logs` deletes events and folded counts older than thirty days daily, in batches of
10,000 and at most 30 batches a run. The Status page reads seven days at most; nothing else reads
older events.

## Ownership Boundary

- Canonical Product and dataset tables own current truth.
- Activity events explain meaningful domain outcomes to operators and users.
- `job_executions` and `job_execution_logs` diagnose individual worker attempts.
- Console logs remain ephemeral runtime detail.

Domain flows emit activity events explicitly after success or failure. Shared automatic job hooks
must not manufacture customer-facing events because only the owning flow knows the correct noun,
action, initiator, and outcome.
