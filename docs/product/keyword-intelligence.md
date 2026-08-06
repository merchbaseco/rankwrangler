---
summary: Defines the caller-transparent keyword intelligence contract and its refresh provenance.
read_when:
  - using public keyword get, search, or history data
  - changing keyword freshness, refresh behavior, provenance, or the Keywords settings page
---

# Keyword intelligence

Keyword intelligence exposes Brand Analytics Top Search Terms as one demand-signal data category.
It complements current Product research; it does not replace Catalog search or become a permanent
keyword subscription.

## Read behavior

The public tRPC procedures are `api.public.keyword.get`, `api.public.keyword.search`, and
`api.public.keyword.history`. Each accepts optional `refresh: true` and returns one top-level
`freshness` envelope: `{ stale, updatedAt }`.

Keyword performance is fresh for 24 hours from the accepted snapshot fetch. The reporting window
and its fetched timestamp are separate: an older reporting period can still be the requested data
while its stored snapshot is fresh.

- Available data returns immediately.
- Stale data remains usable and may start background revalidation.
- A first-time request, or an explicit refresh that needs newer data, waits for policy-satisfying
  data when capacity allows.
- Equivalent requests join one retrieval keyed by canonical keyword and data category. Caller
  timeouts and retries do not cancel or duplicate the durable dataset work.

The public response does not expose an Operation, provider job, track/untrack control, or polling
protocol. Temporary capacity or deadline failures are retryable tRPC `TIMEOUT` errors.

## Provenance and settings

Each stored Top Search Terms snapshot records `requested` or `automatic` refresh provenance. Keyword
history points carry that provenance, and the dashboard displays it alongside trend history.
Settings → Keywords shows the last refresh in the activity table, active and upcoming work, useful
recent refresh volume, queue/deferred capacity signals, and the 30-day interest/weekly refresh
policy. It is intentionally a keyword refresh view, not a general Automation page.

Product search use renews decaying keyword interest for the existing automation policy. The
Top Search Terms ingestion and public keyword reads remain a separate data category.
