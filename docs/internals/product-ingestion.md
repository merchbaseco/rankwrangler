---
summary: Explains how RankWrangler discovers ASINs, fetches source payloads, and reconciles them into canonical Products.
read_when:
  - changing extension discovery, ASIN lookup, SP-API queues, provider normalization, or Product upserts
  - tracing why a Product entered or disappeared from the catalog
---

# Product Ingestion

**Status:** Discovery and SP-API ingestion are current. The source-separated Keepa merge described
below requires the generated Product-schema migration before deployment.

Product ingestion turns source payloads into canonical Products. Discovery only supplies a
marketplace and ASIN; it does not own a separate copy of the Product.

## Discovery Paths

| Path | Behavior |
| --- | --- |
| Extension | Product tiles request the public summary and cache the response locally for one hour. |
| Public summary or rich Product read | Uses the stored SP-API value when fresh; otherwise fetches the ASIN and upserts it. |
| Dashboard ASIN lookup | Fetches one Product through the same SP-API normalization path. |
| Dashboard Amazon keyword search | Returns live search rows, then asynchronously enqueues unique result ASINs. |
| Scheduled SP-API refresh | Selects stale Merch Products by BSR cadence and enqueues their ASINs. |
| Keepa load | Reconciles Keepa current metrics and history into the same Product. |

An ordinary single-ASIN SP-API read treats Product data as fresh for two days by default and joins
identical in-flight requests within the process.

## SP-API Queue

The SP-API queue is unique by marketplace and ASIN. Inserting new work triggers an event-driven,
singleton pg-boss wakeup; startup also kicks the queue so persisted rows survive a restart.

The worker processes up to 20 ASINs at once, validates the provider response, and upserts each
accepted Product. A queued ASIN missing from the provider response is removed from the catalog.
Queue rows are deleted only after reconciliation succeeds; failures remain retryable by a later
wakeup and emit structured activity events.

## Source Normalization

SP-API normalization owns listing text, image, first-available date, root-category rank, and
deterministic Merch detection. Keepa normalization owns current Keepa metrics and event-based rank
and price points. Source-specific timestamps remain separate on the Product.

Ingestion does not assign opportunity scores or interpret whether a seller should pursue the
listing. Semantic facets are a separate [Product classification](product-classification.md)
process.

## Boundaries

- Source adapters validate and normalize upstream payloads.
- Product persistence owns merge rules and transaction boundaries.
- Queues own backpressure and retries, not Product freshness.
- The activity log records meaningful outcomes; job executions record worker attempts.
- External search placement is Search-run data, not a Product field.
