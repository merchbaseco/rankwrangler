---
summary: Separates shipped transient Amazon keyword lookup from the accepted durable Keepa Catalog-search architecture.
read_when:
  - changing Amazon keyword lookup or implementing Catalog queries, Search runs, Search results, or tracking
  - deciding whether query results belong on Products or in immutable run history
---

# Catalog Search

## Status

The SP-API keyword lookup, durable Keepa Catalog search, bounded run-history reads, and explicit
weekly query tracking are shipped.

## Current Behavior

`api.app.amazon.search` performs a US SP-API Catalog Items keyword query for up to 20 results. It
keeps a five-minute in-memory cache and returns normalized transient rows. Returned ASINs are
deduplicated into the SP-API sync queue so they become canonical Products asynchronously.

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

The worker makes one Keepa Product Search request with Product payloads and history enabled.
It does not issue a follow-up Keepa request for every ASIN. One transaction reconciles canonical
Products and their histories, writes the immutable run and ordered results, advances query
freshness, and completes the Operation.

Request resolution is serialized per Catalog query. Fresh-run reuse, pending-work deduplication,
mapped Service Account debit, and new Operation creation share one transaction, so unpaid work is never
visible to callers or recovery and a concurrently completed reusable run does not create a charge.

## Reuse And Tracking

- By default, a successful run no older than 24 hours is returned again.
- A force-fresh request still joins identical in-flight work.
- Queries remain on demand until a consumer explicitly tracks them.
- Tracked queries collect weekly; a fresh manual run satisfies that week's collection window.
- Cached reuse does not advance the weekly watermark.
- A tracked query is due when it has never completed or its latest successful fresh run completed
  at least seven days ago. Startup and minute scans create at most one current run and never
  backfill missed weeks.
- A failed scheduled attempt waits one hour before it is eligible again.
- Untracking removes only schedule eligibility; query, run, and result history remains intact.

Provider tokens remain internal. Agents receive durable IDs and retry guidance, while the dashboard
shows a loading state and invalidates durable reads on completion.

Keepa capacity prioritizes interactive Catalog search, then scheduled Catalog search, then Product
refresh work.

Catalog query reads resolve existing normalized identity without creating provider work. They
return the latest successful run metadata and the current tracking state. Run lists use stable
newest-first cursor pagination, include empty successful runs, and omit result bodies until a
caller requests one run.

## Product Boundary

Run reads expose source-qualified position and immutable `observed` metrics separately from
nullable `currentProduct` state. A missing Product join does not remove the retained result row.
RankWrangler exposes source-attributed evidence; it does not score opportunities, recommend niches,
or automatically promote queries into tracking.
