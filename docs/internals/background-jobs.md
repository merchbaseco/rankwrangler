---
summary: Defines pg-boss job registration, scheduling, idempotency, execution tracking, and separation from domain Operations.
read_when:
  - adding or changing a background job, schedule, queue wakeup, retry, or job observability
  - deciding whether state belongs in pg-boss, a domain table, job executions, or Operations
---

# Background Jobs

RankWrangler runs pg-boss in the server process. Queue creation always occurs; workers, schedules,
and startup wakeups run only when `DISABLE_SERVER_JOB_RUNNER` is false. Local development disables
the runner by default.

## Runtime Contract

Jobs use the shared job definition layer for input validation, pg-boss options, schedules,
concurrency, structured logging, and optional execution persistence. Cron schedules live in
pg-boss, so automatic schedules survive process restarts. Singleton keys prevent overlapping work
where a second attempt would be redundant.

| Workflow | Dispatch model |
| --- | --- |
| SP-API Product sync | Event-driven singleton wakeup, continuation wakeups, and startup kick. |
| SP-API stale Product selection | Every 10 minutes using BSR-dependent freshness tiers. |
| Keepa candidate selection | Hourly scan of eligible stale Products. |
| Keepa queue dispatch | Every minute, capacity-bounded, then one singleton fetch per ASIN. |
| Product-history Operation | Event-driven worker plus one-minute stale-pending recovery. |
| Catalog-search Operation | Event-driven first-page Keepa search plus one-minute stale-pending recovery. |
| Active Catalog keyword | One-minute due scan plus one startup scan; one current run, no backfill. |
| Top Search Terms dataset sync | Every five minutes with a bounded due-window batch. |
| Top Search Terms report fetch | Event-driven; one grouped fetch across server instances. |
| Product facets | One-minute worker definition, currently disabled by policy. |

## State Ownership

pg-boss owns dispatch and execution. Durable domain tables own recoverable state:

- SP-API and Keepa queue tables own pending Product work;
- Top Search Terms datasets own report ID, status, retry time, and recovery state;
- Products own source freshness;
- Catalog queries own keyword activity leases, refresh-attempt timestamps, and latest successful
  run watermarks;
- Operations own a durable outcome across worker attempts, whether the trigger was requested or
  automatic.

Do not use `job_executions` as business state. Those rows record one worker attempt with input,
output, duration, failure, and structured logs. Some no-op successes are intentionally omitted;
scheduler heartbeats that matter operationally can opt into persistence.

## Failure And Recovery

Jobs must leave retry intent in durable domain state before returning. Queue-specific code controls
backoff and redispatch rather than relying on hidden generic retries. Fatal job failures emit a
`job.fatal` activity event with job identity, a bounded error message, and validated job input.

An Operation is one client-visible outcome that can span retries, while a job execution is one
internal attempt. Product-history recovery reclaims only stale pending Operations and dispatches
the same Operation id.
