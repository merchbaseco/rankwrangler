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

The persisted Product model combines normalized fields with explicit source boundaries:

- listing identity, title, brand, image, first-available date, seller-bullet array, and nullable
  Merch-listing knowledge;
- explicit Amazon listing status from successful SP-API Catalog responses;
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

`amazonListingStatus` records the listing outcome separately from those call timestamps. A
successful SP-API response that omits a requested ASIN sets it to `deleted`; a later response
containing the ASIN sets it to `active`. Provider failures do not change it. Active means the Amazon
detail-page listing exists, not that an offer is in stock or buyable. Deleted Products retain
last-known listing fields and are terminal for automatic SP-API freshness work. Only an explicit
refresh or a newer authoritative Catalog discovery rechecks them.

The following public projection is the accepted target; persisted source state and dashboard
observability above remain current.

Public Product reads project the persisted sources into provider-neutral `listing`, `category`,
`salesRank`, `price`, and `demand` groups. A policy-current Product returns immediately. Missing or
policy-expired required data waits through the shared coordinator without creating a public
Operation. Public responses omit source timestamps, freshness, status, and pending availability;
temporary provider failure or deadline exhaustion uses the shared retryable error.

Single public Product get defaults to `include: ['marketData']`, retaining its existing Keepa
freshness check and automatic background Keepa policy. Passing `include: []` skips that on-demand
Keepa check. It does not alter the scheduled Keepa queue or 24-hour successful-fetch guard.
The same get can opt into `listing.shortName`. For a known Merch listing with an
available image, Gemini 3.1 Flash-Lite observes the printed words and distinctive pictured motifs
at low image resolution. Jev selects a word-for-word title span that identifies the design, or
abstains; display capitalization may be normalized. Common occasion phrases include a pictured
motif when that context distinguishes the design. The generation runs in the read request after
listing resolution and overlaps the Keepa history wait when both are requested. A sparse Product
short-name row stores the name or valid abstention, source fingerprint, and generation state only
after opt-in.
Cross-process claims prevent duplicate generation; an expired pending claim can be retried on the
next request. The fingerprint includes title, image URL, and generator version, so unchanged names
have no time-based refresh while changed inputs regenerate. Settings compares fingerprints with the
current title and image to count Products needing regeneration. Generation events and physical Gemini
and TypeSafe attempts feed the admin Settings metrics page. Other Product read paths do not invoke
these providers.
Opted-in reads require `RANKWRANGLER_GEMINI_API_KEY` and `RANKWRANGLER_TYPESAFE_API_KEY`.
The TypeSafe key must be provisioned as a RankWrangler-owned credential in each active lifecycle
before clients use the opt-in; missing credentials fail the opted-in request.

`listing.bulletPoints` is always an array, with `[]` for no bullets. `salesRank` contains `current`
and `averages.last30Days`/`averages.last90Days`; demand drop windows use `last30Days`, `last90Days`,
`last180Days`, and `last365Days`.

The dashboard Product drawer remains source-aware. Its tooltips may expose SP-API and Keepa
provenance, last attempt and success, source observation time, supplied categories, and the latest
error or retry without changing the public Product projection.

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
- The shared Product retrieval service owns blocking lookups, durable queueing, freshness checks,
  in-flight deduplication, and response availability. A completed empty provider response retains
  the canonical identity and last-known listing data, marks the Amazon listing deleted, and advances
  `spApiResolvedAt`.
