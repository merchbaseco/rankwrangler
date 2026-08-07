---
summary: Defines canonical Product identity, current source-attributed state, freshness, and stored-catalog lookup behavior.
read_when:
  - changing Product schema, current metrics, freshness fields, or catalog filtering
  - deciding whether provider results should update a Product or create another record
---

# Product Catalog

**Status:** Canonical Product behavior, split SP-API/Keepa freshness, and current Keepa metrics are
implemented. The generated Product-schema migration must be applied before deployment.

The Product catalog is RankWrangler's canonical current-state store. One Product is identified by
`marketplaceId + asin`, regardless of whether it was discovered by the extension, an ASIN lookup,
an Amazon keyword search, or Keepa.

## Current State

The target Product model combines normalized fields with explicit source boundaries:

- listing identity, title, brand, image, first-available date, seller bullets, and nullable
  Merch-listing knowledge;
- current root-category BSR;
- semantic facets and their classification state;
- internal provider freshness and resolution markers for listing enrichment;
- a source-attributed `keepa` section with Keepa current metrics and freshness.

Keepa state includes current BSR and new price, Amazon's `monthlySold` search-result signal, 30- and
90-day average BSR, rank-drop counts, Keepa tracking/update timestamps, and `fetchedAt`. Nullable
source values remain nullable; they are not converted into inferred metrics.

## Freshness

Freshness is source-specific:

| Field | Meaning |
| --- | --- |
| `spApiFetchedAt` | RankWrangler accepted the latest SP-API Product payload at this time. |
| `spApiResolvedAt` | RankWrangler completed a listing lookup, including an empty response, at this time. |
| `keepaFetchedAt` | RankWrangler persisted the latest successful Keepa Product payload at this time. |
| `keepaSourceUpdatedAt` | Keepa reported its Product record changed at this time. |

`keepaFetchedAt` and `keepaSourceUpdatedAt` answer different questions. Provider import rows remain
diagnostics and provenance; scheduling reads Product freshness directly.

Product detail responses expose one caller-facing `freshness: { stale, updatedAt }` envelope. A
canonical Product that is already available is returned immediately even when stale; the default
read may queue background revalidation. `refresh: true` and a first-time/missing Product wait for
the shared coordinator's blocking policy without creating a public Operation. Definitive provider
absence is `NOT_FOUND`; temporary capacity or deadline failures use the shared provider-neutral
retryable error.

## Lookup Versus Discovery

The dashboard catalog reads stored Products and supports current-state search, pagination, and
facet filtering. It does not call Amazon merely because a user filters the stored catalog.

`api.app.amazon.search` is a separate live keyword lookup. It returns a transient first page and
passes its ASINs through the shared Product retrieval service with background policy. Today it does
not persist query identity, result placement, or run history; that belongs to the accepted
[Catalog search](catalog-search.md) design.

## Update Invariants

- Provider ingestion updates the same Product key instead of creating source-specific Products.
- Keepa persistence updates Product state, history, import diagnostics, freshness, and obsolete
  Keepa queue work in one transaction.
- A failed Keepa transaction never advances `keepaFetchedAt`.
- Missing optional Keepa values do not erase useful stored values.
- `isMerchListing` is nullable knowledge: new unclassified Products start at `null`, available
  empty bullet evidence stores `false`, and unavailable evidence is a persistence no-op. Stored
  `true` is monotonic across provider writes.
- The shared Product retrieval service owns blocking lookups, background queueing, freshness checks,
  in-flight deduplication, and response availability. A completed empty provider response retains
  the canonical identity with an unavailable Product thumbnail and advances `spApiResolvedAt`, so
  reads do not enqueue it forever.
