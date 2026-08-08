---
summary: Defines shipped transient Amazon keyword lookup and durable Keepa Catalog-search architecture.
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
| Search result | One Product's membership and Organic search placement in that run. |
| Operation | Durable receipt for work that can outlive an HTTP request. |

`organicSearchPlacement` is the Product ordinal supplied for one Search run. Invalid or duplicate
provider rows are discarded without renumbering later Products, preserving ordinal gaps.

The worker makes one Keepa Product Search request with Product payloads and history enabled. It does
not issue a follow-up Keepa request for every ASIN. Available bullet evidence in that response is
classified immediately through the shared Merch classifier; the workflow does not wait for SP-API.
One transaction persists Keepa observations, writes the immutable run and ordered results, advances
query freshness, and completes the Operation.
Public Search then passes retained canonical identities through shared Product retrieval and waits
until every result has its compact current Search projection, including a resolved available or
unavailable thumbnail.

Request resolution is serialized per Catalog query. Fresh-run reuse, pending-work deduplication,
mapped Service Account debit, and new Operation creation share one transaction, so unpaid work is never
visible to callers or recovery and a concurrently completed reusable run does not create a charge.

## Reuse And Keyword Refresh

- A successful run satisfying the Search capability's server-owned policy is reusable. A
  policy-expired run remains immutable history but is not returned as the current public Search.
  Equivalent requests share the same canonical Search-run work.
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

Provider tokens and durable Operation identifiers remain internal. Public Product-search callers
receive `keyword`, `searchedAt`, and compact `results`. Each result carries immutable
`organicSearchPlacement` plus identity, title, brand, resolved thumbnail, classification, category,
current sales rank, price, and bought-in-the-past-month evidence. It omits bullets, averages, drop
windows, full demand, and history. Provider failure or deadline exhaustion returns a retryable
error. The dashboard's existing request route may still show loading and invalidate durable reads
on completion.

Keepa capacity prioritizes interactive Catalog search, then scheduled Catalog search, then Product
refresh work.

Catalog query reads resolve existing normalized identity without creating provider work. They
return activity timestamps, derived status, observation count, and latest successful run metadata.
Run lists use stable newest-first cursor pagination, include empty successful runs, and omit result
bodies until a caller requests one run.

## Product And Rank-Tracking Boundaries

Dashboard run reads expose immutable placement and observed metrics separately from nullable current
Product state. Product completion invalidates only the affected exact-ASIN query rather than the
Search-run list. Pending is derived from durable queue membership, and a completed empty lookup is
unavailable rather than requeued forever. A missing Product join does not remove retained Search
membership.

Official Keepa Product Search documentation does not contract Amazon organic ordering; available
integration evidence indicates sponsored results are excluded and organic order is preserved.
Existing Search runs remain opportunistic first-page evidence under decaying keyword interest.
Standalone placement history is out of scope. A future rank tracker needs deliberate multi-page
collection, observed-depth semantics, and continuous bounded scheduling.
RankWrangler exposes source-attributed evidence; it does not score opportunities, recommend niches,
or promote queries from Brand Analytics data into product-search refresh activity.
