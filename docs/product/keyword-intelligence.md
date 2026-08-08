---
summary: Defines current public keyword intelligence and its collection provenance.
read_when:
  - using public keyword get, search, or history data
  - changing keyword retrieval policy, collection provenance, or the Keywords settings page
---

# Keyword intelligence

**Public retrieval status:** The no-refresh caller-synchronous behavior below is the accepted target.
Stored snapshots and collection provenance are current behavior.

Keyword intelligence exposes Brand Analytics Top Search Terms as one demand-signal data category.
It complements current Product research; it does not replace Catalog search or become a permanent
keyword subscription.

## Read behavior

The public tRPC procedures are `api.public.keyword.get`, `api.public.keyword.search`, and
`api.public.keyword.history`. Freshness policy belongs to the server, not their inputs or outputs.

Keyword performance is fresh for 24 hours from the accepted snapshot fetch. The reporting window
and its fetched timestamp are separate: an older reporting period can still be the requested data
while its stored snapshot is fresh.

- Policy-current data returns immediately.
- Missing or policy-expired data starts or joins durable work and waits.
- Equivalent requests join one retrieval keyed by canonical keyword and data category. Caller
  timeouts and retries do not cancel or duplicate the durable dataset work.

The public response does not expose freshness, an Operation, provider job, track/untrack control,
or polling protocol. Retryable provider failure or deadline exhaustion produces a retryable error.

## Provenance and settings

Each stored Top Search Terms snapshot records `requested` or `automatic` refresh provenance. Keyword
history points carry that provenance, and the dashboard displays it alongside trend history.
Settings → Keywords shows the last refresh in the activity table, active and upcoming work, useful
recent refresh volume, queue/deferred capacity signals, and the 30-day interest/weekly refresh
policy. It is intentionally a keyword refresh view, not a general Automation page.

Product search use renews decaying keyword interest for the existing automation policy. The
Top Search Terms ingestion and public keyword reads remain a separate data category.
