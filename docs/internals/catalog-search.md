---
summary: Separates shipped transient Amazon keyword lookup from the accepted durable Keepa Catalog-search architecture.
read_when:
  - changing Amazon keyword lookup or implementing Catalog queries, Search runs, Search results, or keyword refresh
  - deciding whether query results belong on Products or in immutable run history
---

# Catalog Search

## Status

The SP-API keyword lookup, durable Keepa Catalog search, bounded run-history reads, and decaying
weekly keyword refresh are shipped.

## Current Behavior

`api.app.amazon.search` performs a US Amazon Catalog Items keyword query for up to 20 results. It
keeps a five-minute in-memory cache, returns normalized transient rows, and passes their identities
through the shared Product retrieval service with background policy.

Current keyword lookup does **not** persist the query, result ordering, or a dated run. A dashboard
catalog lookup, by contrast, searches Products already stored in RankWrangler and does not call a
provider.

## Accepted Durable Model

The Keepa workflow uses four nouns:

| Noun | Contract |
| --- | --- |
| Catalog query | Normalized provider-, marketplace-, term-, and page-scoped search identity. |
| Search run | One successful immutable provider execution at a specific time. |
| Search result | One Product's membership, provider position, and observed metrics in that run. |
| Operation | Durable receipt for work that can outlive an HTTP request. |

`sourcePosition` means provider response order. It is not Amazon organic rank unless the source
explicitly guarantees that meaning.

The worker makes one Keepa Product Search request with Product payloads and history enabled. It does
not issue a follow-up Keepa request for every ASIN. One transaction persists Keepa observations,
writes the immutable run and ordered results, advances query freshness, and completes the Operation.
It does not inspect listing freshness or enqueue listing work. Run reads pass retained canonical
identities through the shared Product retrieval service with background policy, so fresh and cached
run paths behave identically.

Request resolution is serialized per Catalog query. Fresh-run reuse, pending-work deduplication,
mapped Service Account debit, and new Operation creation share one transaction, so unpaid work is never
visible to callers or recovery and a concurrently completed reusable run does not create a charge.

## Reuse And Keyword Refresh

- By default, a successful run no older than 24 hours is returned again.
- A force-fresh request still joins identical in-flight work.
- Every product search request renews `lastRequestedAt` and `activeUntil` for 30 days, including
  cached reuse. The request is recorded as a `requested` Search-run trigger when it produces a run.
- Active queries collect weekly. A query is due when it has never completed or its latest successful
  run completed at least seven days ago. Startup and minute scans create at most one current run
  and never backfill missed weeks.
- A failed scheduled attempt waits one hour before it is eligible again.
- `activeUntil`, latest success, pending Operation state, failure state, and retry timestamps derive
  visible statuses such as inactive, due, waiting, deferred, and failed.
- Automatic runs carry `trigger: automatic`; requested runs carry `trigger: requested`. Trigger is
  run-history provenance only and is absent from canonical Product/result shapes.

Provider tokens remain internal. Agents receive durable IDs and retry guidance, while the dashboard
shows a loading state and invalidates durable reads on completion.

Keepa capacity prioritizes interactive Catalog search, then scheduled Catalog search, then Product
refresh work.

Catalog query reads resolve existing normalized identity without creating provider work. They
return activity timestamps, derived status, observation count, and latest successful run metadata.
Run lists use stable newest-first cursor pagination, include empty successful runs, and omit result
bodies until a caller requests one run.

## Product Boundary

Run reads expose source-qualified position and immutable `observed` metrics separately from
nullable `currentProduct` state plus named `currentProductAvailability`. The dashboard seeds a
per-ASIN Product query from that snapshot; Product completion invalidates only the affected exact
ASIN Product query rather than the Search-run list. Pending is derived from durable queue membership,
and a completed empty lookup is represented as unavailable rather than requeued forever. A missing
Product join does not remove the retained result row.
RankWrangler exposes source-attributed evidence; it does not score opportunities, recommend niches,
or promote queries from Brand Analytics data into product-search refresh activity.
