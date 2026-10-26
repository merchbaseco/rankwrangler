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
| SP-API stale Product selection | Every 10 minutes for available Products using BSR-dependent freshness tiers. |
| Keepa candidate selection | Hourly scan of eligible stale Products. |
| Keepa queue dispatch | Every minute, capacity-bounded, then one singleton fetch per ASIN. |
| Product-history Operation | Event-driven worker plus one-minute stale-pending recovery. |
| Catalog-search Operation | Event-driven first-page Keepa search plus one-minute stale-pending recovery. |
| Active Catalog keyword | One-minute due scan plus one startup scan; one current run, no backfill. |
| Product facets | One-minute worker definition, currently disabled by policy. |
| Provider-attempt retention | Daily bounded deletion of attempts older than seven days. |

The `process-keyword-sync` coordinator owns the new keyword loop. It runs discovery,
autocomplete and ASIN keyword-mining stages, checks the persistent pause switch between stages,
and schedules the next cycle no faster than ten seconds. A minute watchdog recovers lost wakes.
Old independent stage schedules are unscheduled at startup. Errors are reported after the other
stages have had an opportunity to progress; one provider failure cannot starve the remaining stages.

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
