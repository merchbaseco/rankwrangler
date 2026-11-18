---
summary: Defines pg-boss job registration, scheduling, idempotency, execution tracking, and separation from domain Operations.
read_when:
  - adding or changing a background job, schedule, queue wakeup, retry, or job observability
  - deciding whether state belongs in pg-boss, a domain table, job executions, or Operations
---

# Background Jobs

RankWrangler runs pg-boss in the server process. Queue creation always occurs; workers, schedules,
and startup wakeups run only when `RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER` is false. Local development disables
the runner by default.

## Runtime Contract

Jobs use the shared job definition layer for input validation, pg-boss options, schedules,
concurrency, structured logging, and optional execution persistence. Cron schedules live in
pg-boss, so automatic schedules survive process restarts. Singleton keys prevent overlapping work
where a second attempt would be redundant.

| Workflow | Dispatch model |
| --- | --- |
| SP-API Product sync | Event-driven singleton wakeup, continuation wakeups, and startup kick. |
| SP-API stale Product selection | Every 10 minutes: up to 2,000 BSR-tier refreshes and 20 no-BSR checks, most overdue first, from due-at indexes. |
| Keepa candidate selection | Five-minute top-up of tier-due Products from the Keepa due-at index. |
| Keepa queue dispatch | Every minute, capacity-bounded, then one singleton fetch per ASIN. |
| Product-history Operation | Event-driven worker plus one-minute stale-pending recovery. |
| Catalog-search Operation | First-page Keepa search: interactive ones run in process at dispatch, scheduled ones on the queue; one-minute stale-pending recovery. |
| Active Catalog keyword | One-minute due scan plus one startup scan; one current run, no backfill. |
| Product facets | One-minute worker definition, currently disabled by policy. |
| Provider-attempt retention | Daily bounded deletion of Provider and Keepa capacity attempts older than seven days. |
| Product counts | Five-minute exclusive snapshot (`refresh-product-stats`), sent once at startup while none exists. |
| Job-execution retention | Daily bounded deletion of run history older than fourteen days. |
| Event-log retention | Daily bounded deletion of events and folded counts older than thirty days (`prune-event-logs`). |
| Event-log counts | Minute exclusive fold of new events into the Status histogram counts (`fold-event-log-counts`). |
| Explore default facets | Fifteen-minute exclusive exact count of Explore's default view (`refresh-product-search-facets`), sent once at startup while none exists. |
| Keyword pipeline | One-minute scheduler feeding the scan and autocomplete queues and the weekly Brand Analytics import. |

New and changed jobs follow [background jobs](../decisions/background-jobs.md): one job per external
call on one entity, one queue per provider, schedulers that only enqueue. A job definition can declare
`.queue({ policy })` and `.gate(providerGate, { concurrency })`. A gated queue runs worker loops
(one by default; `scan-keyword` runs four) that fetch the next job, by priority, only once the gate
is open: the autocomplete gate waits for its provider spacing, the scan gate only for Pause sync,
since the Catalog limiter paces each request. The job may return a `followup` to re-send itself for
its entity after it completes. Entity queues use the `exclusive` policy keyed by
entity. A scheduler that may outrun its interval uses `exclusive` too, so ticks sent during a
slow run are dropped rather than queued behind it. pg-boss never changes a stored queue policy, so
startup recreates a scheduled job's queue (ticks only) when its declared policy differs; entity
queues are never recreated. Recreation is one transaction: on failure startup logs the database
error, keeps the old queue and policy, and tries again on the next start. The keyword pipeline is the first user; see
[keyword jobs](keyword-mining.md#keyword-jobs). Every one-minute tick queue (`collect-due-catalog-queries`,
`reconcile-history-admission`, `backfill-product-variations`, `process-keepa-history-refresh-queue`,
`process-product-facet-classification`, both stale-Operation recoveries,
`enqueue-scheduled-keepa-history-refresh`, `fold-event-log-counts`) and the snapshot and retention
jobs (`refresh-product-stats`, `refresh-product-search-facets`, `prune-event-logs`) are exclusive. Event-driven
queues such as `process-spapi-sync-queue` keep their own policy. Retired `process-keyword-sync` and older keyword
stage schedules are unscheduled at startup.

## Retention And Connections

pg-boss keeps a finished job row for one day (`JOB_RETENTION_SECONDS`), not its seven-day default:
run history lives in `job_executions`, and a week of keyword scans was over half a million rows that
pg-boss's once-a-minute monitor reads. Startup applies the retention to every registered queue and
to pg-boss's cron queue (`__pgboss__send-it`); rows sent earlier keep theirs until they expire.
Maintenance deletes expired rows hourly. Code that counts waiting jobs uses `countQueuedJobs`,
which reads pg-boss's queued-job index, never `getQueueStats`, which counts the whole history.

pg-boss connects directly with a pool of five (`createJobBoss`); see
[PlanetScale](../operations/planetscale.md) for the connection budget.

## State Ownership

pg-boss owns dispatch and execution. Durable domain tables own recoverable state:

- SP-API and Keepa queue tables own pending Product work;
- Products own source freshness;
- Catalog queries own keyword activity leases, refresh-attempt timestamps, and latest successful
  run watermarks;
- Operations own a durable outcome across worker attempts. Public Product-history retrieval hides
  Operations; the existing dashboard app workflow and Catalog workflows can expose them.

Do not use `job_executions` as business state. Those rows record one worker attempt with input,
output, duration, failure, and structured logs. Some no-op successes are intentionally omitted;
scheduler heartbeats that matter operationally can opt into persistence.

## Failure And Recovery

Jobs must leave retry intent in durable domain state before returning. Queue-specific code controls
backoff and redispatch rather than relying on hidden generic retries. Fatal job failures emit a
`job.fatal` activity event with job identity, a bounded error message, and validated job input.

An Operation can span retries, while a job execution is one internal attempt. Product-history
recovery reclaims only stale pending Operations and dispatches the same Operation id; public
Product-history reads do not return that id.
