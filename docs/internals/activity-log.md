---
summary: Defines persisted domain activity events, their status and identity fields, query behavior, and separation from job logs.
read_when:
  - adding a customer-visible event action or changing activity-log filters and status semantics
  - deciding whether information belongs in event logs, job executions, or canonical domain state
---

# Activity Log

The activity log is a searchable, persisted timeline of meaningful Product, history, job, and
system outcomes. The dashboard reads it through a Clerk-authenticated paginated query.

## Event Shape

Events carry a domain action and outcome plus optional Product, marketplace, job-run, and request
correlation. One action name represents one operation; outcome belongs in status rather than a
second action family. The [Events reference](../reference/events.md) owns exact fields, enums, and
current action names.

## Query Contract

The list query uses stable cursor pagination and can filter by level, status, primitive type,
action, ASIN, marketplace, or job run. Free-text search covers message and common identity fields.
The current account scope is the global RankWrangler corpus.

## Ownership Boundary

- Canonical Product and dataset tables own current truth.
- Activity events explain meaningful domain outcomes to operators and users.
- `job_executions` and `job_execution_logs` diagnose individual worker attempts.
- Console logs remain ephemeral runtime detail.

Domain flows emit activity events explicitly after success or failure. Shared automatic job hooks
must not manufacture customer-facing events because only the owning flow knows the correct noun,
action, initiator, and outcome.
