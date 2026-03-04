# Jobs And Events

## Admin Job Observability

- Job executions and structured job logs are stored in:
  - `job_executions`
  - `job_execution_logs`
- Dashboard uses `api.app.jobExecutions` (admin-gated via `ADMIN_EMAIL`)
- Keepa queue + recent processed Keepa jobs are exposed via `api.app.keepaLog`
- `api.app.getAdminStats` includes SP-API + Keepa refresh-policy bucket counts
- SP-API queue processing is event-driven (enqueue-triggered + startup kick), not interval-polled
- Keepa queueing includes an hourly scheduled enqueue job for `<1M` merch BSR cohorts
- Automatic scheduled jobs are persisted in pg-boss schedule storage (cron-backed), so they
  survive process restarts
- Scheduled jobs are configured with per-job singleton keys to avoid overlapping duplicate
  dispatches
- Job failures are persisted via `runTrackedJob`; worker-level errors are intentionally swallowed
  after persistence so queue retries are controlled explicitly by job logic and follow-up scheduling

## Event Logging Principles

- Customer-facing events are emitted manually in flow-specific code.
- Do not rely on shared automatic job completion/failure event hooks.
- `1 action = 1 event flow` (use explicit initiator variants when needed).
- Action names describe operation; outcome is `status` + `level`.
- Emit success/failure events after operation completion/failure, never at operation start.
- Every job must have explicit `try/catch/finally`.
- Every job catch path emits `job.fatal` with:
  - `jobName`
  - `jobRunId`
  - `requestId`
  - input + error details

## Current Event Actions

- `history.sync.manual`
- `history.sync.background`
- `product.sync`
- `job.fatal`
