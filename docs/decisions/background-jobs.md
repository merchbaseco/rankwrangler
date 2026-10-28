---
summary: Records why RankWrangler background work runs as small entity jobs behind provider-gated queues, fed by schedulers that read due state from the database.
read_when:
  - adding or changing a background job, queue, scheduler or follow-up enqueue
  - deciding how work waits for SP-API, Keepa or autocomplete capacity
  - changing how operators see job runs, queue depth or provider readiness
---

# Background Jobs

**Status:** Accepted, October 27, 2026. The keyword pipeline is the first system built this way.

A background system answers three separate questions, and RankWrangler gives each its own owner:

| Question | Owner |
| --- | --- |
| What needs doing? | Entity state in the database: each Product, keyword or seed knows its stage and when it is next due. |
| What runs now? | pg-boss queues, one per provider, each admitting a job only when that provider's gate has room. |
| What happened? | Job executions, entity events and Provider attempts, which all name the same entity. |

## Primitives

- **Entity.** A Product, keyword target, autocomplete seed or weekly Brand Analytics import. Due times, stages, claims and
  failure counts stay in its tables. The database remains the source of truth; a lost or duplicate
  job never loses or repeats durable work, because jobs re-check and fence that state.
- **Job.** One unit of work on one entity: at most one external call, save what came back, then
  enqueue whatever that result makes ready. A job never loops for a time budget or works through
  other entities. Batching is allowed only where the provider batches (SP-API reads 20 ASINs).
- **Scheduler.** A short, frequent job that finds due entities and enqueues them. It does no
  provider work. Follow-ups that a job's own result makes ready are enqueued by that job directly.
- **Provider gate.** The existing durable reservation for SP-API, Keepa or autocomplete.
  A gated queue fetches its next job only once its gate reports readiness, so jobs do not start,
  find no capacity and reschedule. A job that still loses a reservation race is re-enqueued for the
  gate's ready time and recorded as waiting, not failed.
- **Record.** Each run is a job execution whose input names the entity. Domain events land in the
  entity's event log. Provider attempts stay short-lived telemetry.

## Rules

- **One queue per provider.** Jobs that share a provider share its queue, so one gate serves them
  in one order. Queue names describe the work (`scan-keyword`, `autocomplete-keyword`).
- **One job per entity at a time.** Entity jobs use the `exclusive` queue policy with the entity as
  the singleton key, so a scheduler can re-enqueue due work every minute without duplicates.
- **Priority is coarse.** Higher priority for work that keeps existing data fresh (due keyword
  heads) over work that extends it (deeper pages, backfill). Within a priority, oldest first. Lower
  priority work that waits too long is raised by its scheduler, so it cannot starve.
- **Backpressure reads queue depth.** Producers (Brand Analytics trials, autocomplete) are admitted
  only while queued scan work is within its allowance.
- **Pause stops admission.** Paused schedulers enqueue nothing and gated workers fetch nothing;
  a job already running finishes saving.
- **Records stay small.** Successful runs are kept when they did work; failures always. Executions
  and attempts are pruned.

## Consequences

Operators watch work as it happens: each queue's waiting, running and oldest job; each provider's
readiness; recent runs per entity. Shape and volume are explicit: roughly one job per external
call, about 20–25k a day at full keyword collection, which pg-boss handles.

A single gated worker per provider serializes that provider's work in one process. That matches
today's single server and the background rates (one SP-API page every few seconds, one
autocomplete call every ten). Parallel workers would need gates that hand out several reservations at once.

Existing systems move onto this shape when next changed. Keepa history already follows it
(scheduler, per-ASIN job); Product refresh keeps its 20-ASIN batches as the job unit.
