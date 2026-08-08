---
summary: Defines external Product search, immutable Search-run evidence, and decaying keyword interest.
read_when:
  - planning or implementing Catalog queries, Search runs, or keyword refresh
  - deciding whether a request is stored catalog lookup, external Product search, or rank tracking
---

# Catalog Search

**Public retrieval status:** The complete Product-search response below is the accepted target.
Durable Search runs, dashboard history, and decaying keyword interest are current behavior.

Catalog search collects external results and preserves what the source surfaced at a moment in
time. It complements stored catalog lookup:

| Capability | Meaning |
| --- | --- |
| Catalog lookup | Search RankWrangler's canonical stored Products in their current state. |
| Product search | Execute a marketplace query, retain its Search run, and reconcile accepted results with canonical Products. |

## Contract

- Search covers the US marketplace, first page, and up to 20 Products.
- One provider request supplies result Products and histories; RankWrangler does not make a second
  history request for every ASIN.
- Each public result combines immutable Search-run membership and `organicSearchPlacement` with a
  complete current Product projection, including resolved thumbnail availability.
- A policy-current successful run can be reused. When no current run exists, the caller starts or
  joins Search and Product-enrichment work and waits. Equivalent requests deduplicate.
- Every requested Product search renews keyword interest for 30 days, including cached reuse. This
  is the only activation event; there is no permanent subscription or manual toggle.
- Active keywords are eligible for weekly automatic collection. Inactive keywords expire without
  backfill. Each Search run retains `requested` or `automatic` provenance.

Durable Search work is asynchronous internally, but public `product.search` returns final data from
the caller's perspective. The response contains `searchedAt` and source-order Products, never
freshness, provider, Operation, polling, pending-thumbnail, or status fields. Retryable provider
failure or deadline exhaustion is the only temporary result.

The dashboard retains its Operation-driven loading and run-history workflow. It may show a pending
thumbnail while enriching a retained Search run; public Search waits for that same Product work and
resolves the thumbnail as available or unavailable.

## Placement Evidence

Organic search placement is the Product ordinal supplied for one Search run. Invalid or duplicate
rows leave gaps rather than renumbering later Products. Search-run membership and placement are
immutable evidence; the included Product projection is independent current state.

Existing Search runs are opportunistic top-20 evidence under decaying keyword interest. RankWrangler
does not expose standalone placement history or promise rank-tracking coverage or cadence. A future
rank tracker requires deliberate multi-page collection, observed-depth semantics, and continuous
bounded scheduling.

## Boundaries

- Search does not score niches, infer intent, or recommend a design.
- Automatic collection is never enabled from popularity, Brand Analytics Top Search Terms, or
  inferred seasonality.
- Provider capacity, scheduling, and work attempts stay internal.
- V1 does not include private tenant queries, additional pages or marketplaces, deliberate
  multi-page rank tracking, arbitrary cadences, or raw provider payload retention.

See [the accepted architecture decision](../decisions/catalog-search.md) for the storage and
lifecycle tradeoffs.
