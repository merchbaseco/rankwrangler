---
summary: Defines the canonical Product catalog and the current lookup and filtering experience.
read_when:
  - looking up a stored Product by ASIN, title, brand, BSR, marketplace, or facet
  - deciding whether a new observation belongs on the canonical Product
---

# Product Catalog

**Public retrieval status:** The provider-neutral Product projection below is the accepted target.
Dashboard catalog behavior is current.

The catalog stores one canonical current Product for each Amazon marketplace and ASIN. A Product
outlives the path that discovered it: extension browsing, an API lookup, and a dashboard search all
converge on the same record.

## What a Product carries

- Amazon identity and listing details such as ASIN, title, brand, image, a bullet-point array, and
  first-available date. A current Product with no bullets carries `[]`.
- Nullable Merch-listing classification and normalized facets. `null` means unknown; it is not
  silently treated as known non-Merch.
- Whether Amazon currently returns the listing through SP-API Catalog Items.
- Current root-category sales rank with `last30Days` and `last90Days` averages, price,
  bought-in-the-past-month evidence, and Sales-rank drops over `last30Days`, `last90Days`,
  `last180Days`, and `last365Days`.
- Links to historical observations; history is not embedded into the current Product record.

Public Product responses group this state into provider-neutral `listing`, `category`, `salesRank`,
`price`, and `demand` concepts. `listing.amazonListingStatus` is `active` while the marketplace
detail-page listing exists and `deleted` when Amazon has effectively removed it. Active does not
promise an in-stock or buyable offer. The thumbnail separately resolves as available with a URL or
unavailable; thumbnail unavailability only means there is no usable image. A deleted listing keeps
its last-known Product fields and image.
Public callers never receive a pending thumbnail. `null` means a valid measurement is unavailable,
not zero or retrieval failure.

## Using the catalog

The dashboard lists stored Products and supports text search across ASIN, brand, and title. Readers
can narrow the visible set by marketplace, BSR, freshness, and assigned facets, then open a Product
to inspect details and history.

Agents use the public API, typed client, or CLI to read a Product by marketplace and ASIN. A current
cached Product returns immediately. Missing or policy-expired Product data starts or joins durable
work and waits; the public response is one current Product or a retryable error.

Integrations that only need listing labels use the public basic Product batch. It accepts up to 200
unique marketplace/ASIN pairs, preserves request order, and returns fixed-shape identity, title,
thumbnail, and Amazon listing status. A deleted listing retains last-known Product values. Every
requested identity joins the canonical catalog; eligible Products begin Keepa history collection
asynchronously under the normal tracking policy.

The dashboard Product drawer remains source-aware and may explain collection provenance and recent
work. That observability is not part of the public Product contract.

**Brief user story:** An agent resolves an ASIN once, then reads the same canonical Product when it
later appears in a different research workflow.

## Boundaries

- Catalog lookup searches stored Products; it is not an Amazon search-results query.
- Current Product state does not preserve where or in what order the Product was discovered.
- Nullable measurements remain unavailable rather than being inferred or converted to zero.
- RankWrangler exposes evidence for opportunity assessment, not an opportunity verdict.
