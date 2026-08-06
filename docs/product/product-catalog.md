---
summary: Defines the canonical Product catalog and the current lookup and filtering experience.
read_when:
  - looking up a stored Product by ASIN, title, brand, BSR, marketplace, or facet
  - deciding whether a new observation belongs on the canonical Product
---

# Product Catalog

**Status:** Catalog behavior and the source-separated Keepa fields described below are
implemented. Apply the generated Product-schema migration before deployment.

The catalog stores one canonical current Product for each Amazon marketplace and ASIN. A Product
outlives the path that discovered it: extension browsing, an API lookup, and a dashboard search all
converge on the same record.

## What a Product carries

- Amazon identity and listing details such as ASIN, title, brand, image, bullets, and first-available
  date.
- Merch-listing classification and normalized facets.
- Current root-category BSR and source-specific freshness.
- Current normalized Keepa observations, including BSR, price, rank averages and drops, and
  Amazon's bought-in-the-past-month value when Keepa supplies it.
- Links to historical observations; history is not embedded into the current Product record.

Provider timestamps stay distinct internally. Product responses expose category-level availability
through the `thumbnail` union (`pending`, `available` with a URL, or `unavailable`) and one
`freshness: { stale, updatedAt }` envelope. They do not expose provider status fields or a
provider-named freshness label.

## Using the catalog

The dashboard lists stored Products and supports text search across ASIN, brand, and title. Readers
can narrow the visible set by marketplace, BSR, freshness, and assigned facets, then open a Product
to inspect details and history.

Agents use the public API, typed client, or CLI to read a Product by marketplace and ASIN. Blocking
reads use the shared Product retrieval service. An available stale detail returns immediately while
the default policy may queue revalidation; `refresh: true` and missing detail data wait for the
coalesced server-owned fetch. Bulk and Catalog reads return stored state immediately while
queueing unresolved or stale identities in the background.

**Brief user story:** An agent resolves an ASIN once, then reads the same canonical Product when it
later appears in a different research workflow.

## Boundaries

- Catalog lookup searches stored Products; it is not an Amazon search-results query.
- Current Product state does not preserve where or in what order the Product was discovered.
- Nullable provider values remain unknown rather than being inferred.
- RankWrangler exposes evidence for opportunity assessment, not an opportunity verdict.
