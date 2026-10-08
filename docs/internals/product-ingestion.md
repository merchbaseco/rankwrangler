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
| Public basic Product batch | Resolves up to 200 unique identities synchronously, using marketplace-specific SP-API batches of 20. |
| Dashboard ASIN lookup | Uses the same shared blocking Product retrieval service. |
| Dashboard Amazon keyword search | Returns live search rows and passes unique identities through shared background retrieval. |
| Scheduled SP-API refresh | Selects stale Merch Products by BSR cadence and enqueues their ASINs. |
| Keepa load | Reconciles Keepa current metrics and history into the same Product. |
| Keepa Catalog search | Classifies returned Keepa bullet evidence during normalization, then persists immutable membership/observations; run reads pass canonical identities through shared background retrieval. |

The shared Product retrieval service treats listing data as fresh for two days by default, joins
identical Product fetches through the retrieval coordinator, and centralizes background queueing,
blocking waits, freshness, and availability. Durable SP-API work uses the same detail coordinator.
Public reads return current cached detail immediately. Product `get` and `getMany` use the
`last-known` fetch policy: a policy-expired Product with a resolved listing returns at once and
queues a deduplicated background refresh, and only a Product with no resolved listing waits.
Neither exposes a public Operation or refresh control.

The SP-API sync queue job bounds each batch at five minutes, and the Catalog Search limiter fails a
call that has not started within two minutes with a named `SpApiLimiterWaitError` (logged with the
limiter's queue counts) instead of waiting forever. Reports limiters stay unbounded because their
one-per-minute refills legitimately queue for many minutes.

## SP-API Queue

The SP-API queue is unique by marketplace and ASIN. Inserting new work triggers an event-driven,
singleton pg-boss wakeup; startup also kicks the queue so persisted rows survive a restart.

The worker and caller-synchronous batch retrieval process up to 20 same-marketplace ASINs per
SP-API request, validate the provider response, and upsert each
accepted Product. A queued ASIN missing from a successful provider response remains as a canonical
identity, keeps its last-known listing data, gets a durable resolution timestamp, and receives
`amazonListingStatus: deleted`. A later response containing the ASIN sets the status to `active`.
Provider failures do neither.
Queue rows are deleted only after reconciliation succeeds; failures remain retryable by a later
wakeup and emit structured activity events. Each committed Product upsert also emits an
identity-only completion event so active dashboard Product queries can invalidate precisely.

All Catalog calls share one in-process Bottleneck limiter whose reservoir is retuned after throttles.
`patches/bottleneck@2.19.5.patch` keeps the reservoir heartbeat alive across `updateSettings()`;
without it one throttle retune drains the reservoir permanently and every Catalog call queues
forever. Drop the patch only for a Bottleneck release that fixes `_startHeartbeat`.
Deleted Amazon listings do not age back into automatic or scheduled SP-API work. A newer authoritative
Catalog discovery or an explicit refresh can recheck them; a cached or older discovery cannot.

## Source Normalization

SP-API and Keepa adapters own source-specific listing extraction, while one source-neutral module
owns deterministic Merch template matching and seller-bullet extraction. Keepa normalization also
owns current Keepa metrics and event-based rank and price points. Source-specific timestamps remain
separate on the Product.

Ingestion does not assign opportunity scores or interpret whether a seller should pursue the
listing. Semantic facets are a separate [Product classification](product-classification.md)
process.

## Boundaries

- Provider bridges invoke typed Keepa and SP-API operations and own authentication, rate limits,
  retries, and Provider-attempt telemetry.
- Source-specific services validate and normalize upstream payloads.
- Product persistence owns merge rules and transaction boundaries.
- Queues own backpressure and retries, not Product freshness.
- The activity log records meaningful outcomes; job executions record worker attempts.
- External search placement is Search-run data, not a Product field.
