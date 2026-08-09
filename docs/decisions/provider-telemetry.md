---
summary: Records why RankWrangler captures short-lived raw Provider attempts through typed Provider bridges.
read_when:
  - adding or changing Keepa, SP-API, LWA, or report-download calls
  - changing Provider telemetry storage, retention, querying, or integration ownership
---

# Provider Telemetry And Bridges

**Status:** Accepted

RankWrangler keeps every external Provider call behind a typed, provider-specific bridge. A bridge
maps RankWrangler inputs to the Provider request and owns integration housekeeping such as
authentication, rate limiting, retries, and Provider telemetry. Business policy, normalization,
persistence, queues, and domain events remain outside the bridge.

Every physical request, including each retry, creates one fail-open Provider-attempt row. Rows keep
only a generated id, typed Provider and operation, attempt time, nullable status code, error flag,
and latency. Raw URLs, payloads, headers, query strings, error text, and business correlation are
excluded. A daily bounded cleanup retains seven days. One typed admin read provides bounded totals,
operation/outcome breakdowns, and recent attempts without adding a dashboard.

Provider telemetry remains separate from Product imports, activity events, job executions, and
canonical state. RankWrangler first implements the shared capture interface locally without an
observability dependency, generic Provider client, historical backfill, rollups, sampling, or a
cross-service package. Extraction becomes appropriate only after RankWrangler and Merchbase Core
prove the same capture contract.
