---
summary: Explains how RankWrangler discovers ASINs, fetches source payloads, and reconciles them into canonical Products.
read_when:
  - changing extension discovery, ASIN lookup, SP-API queues, provider normalization, or Product upserts
  - tracing why a Product entered or disappeared from the catalog
---

# Product Ingestion

**Status:** Discovery, SP-API ingestion, source-separated Keepa merge, and nullable Merch-listing
classification are implemented. The generated Product-schema migration must be applied before
deployment.

Product ingestion turns source payloads into canonical Products. Discovery only supplies a
marketplace and ASIN; it does not own a separate copy of the Product.

## Discovery Paths

| Path | Behavior |
| --- | --- |
| Extension | Product tiles request the public summary and cache the response locally for one hour. |
| Public summary or rich Product read | Uses the shared blocking Product retrieval service. |
| Dashboard ASIN lookup | Uses the same shared blocking Product retrieval service. |
| Dashboard Amazon keyword search | Returns live search rows and passes unique identities through shared background retrieval. |
| Scheduled SP-API refresh | Selects stale Merch Products by BSR cadence and enqueues their ASINs. |
| Keepa load | Reconciles Keepa current metrics and history into the same Product. |
| Keepa Catalog search | Classifies returned Keepa bullet evidence during normalization, then persists immutable membership/observations; run reads pass canonical identities through shared background retrieval. |

The shared Product retrieval service treats listing data as fresh for two days by default, joins
identical Product fetches through the retrieval coordinator, and centralizes background queueing,
blocking waits, freshness, and availability. The durable SP-API worker and explicit Product
refreshes use the same detail work coordinator; a completed explicit refresh also removes its
matching durable queue row. Available stale detail reads return immediately; explicit refreshes
and missing details wait without exposing a public Operation.

## SP-API Queue

The SP-API queue is unique by marketplace and ASIN. Inserting new work triggers an event-driven,
singleton pg-boss wakeup; startup also kicks the queue so persisted rows survive a restart.

The worker processes up to 20 ASINs at once, validates the provider response, and upserts each
accepted Product. A queued ASIN missing from the provider response remains as a canonical identity,
gets a durable resolution timestamp, and is returned as unavailable instead of being requeued
forever.
Queue rows are deleted only after reconciliation succeeds; failures remain retryable by a later
wakeup and emit structured activity events. Each committed Product upsert also emits an
identity-only completion event so active dashboard Product queries can invalidate precisely.

## Source Normalization

SP-API and Keepa adapters own source-specific listing extraction, while one source-neutral module
owns deterministic Merch template matching and seller-bullet extraction. Keepa normalization also
owns current Keepa metrics and event-based rank and price points. Source-specific timestamps remain
separate on the Product.

Ingestion does not assign opportunity scores or interpret whether a seller should pursue the
listing. Semantic facets are a separate [Product classification](product-classification.md)
process.

## Boundaries

- Source adapters validate and normalize upstream payloads.
- Product persistence owns merge rules and transaction boundaries.
- Queues own backpressure and retries, not Product freshness.
- The activity log records meaningful outcomes; job executions record worker attempts.
- External search placement is Search-run data, not a Product field.
