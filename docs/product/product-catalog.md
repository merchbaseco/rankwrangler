---
summary: Defines the canonical Product catalog and the current lookup and filtering experience.
read_when:
  - looking up a stored Product by ASIN, title, brand, BSR, marketplace, or facet
  - deciding whether a new observation belongs on the canonical Product
---

# Product Catalog

**Implementation status:** Unified catalog search is prepared in source. Its migration and
production deployment are pending.

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

The dashboard and public `product.search` share a database query over collected Products. Text,
BSR, dates, price, demand, marketplace, brands, and facets narrow the whole catalog before paging.
Sorting also runs against the whole matching catalog. Default research results show active known
Merch listings in the US and hide brands explicitly recorded as official. The initial registry is
empty, so no brands are hidden until verified entries are added. Unknown brands remain visible.

Text matches words across title, brand, and bullets, or title alone when requested. All entered
words must match. Matching does not stem words or expand concepts. With all text fields enabled,
a Product previously observed for that exact normalized keyword can also match. Explicit word
and brand exclusions narrow the result further.

Search returns immediately from stored data with compact market metrics. Current BSR uses the
canonical root-category value consistently for filtering, ordering, and output. Search never waits
for Amazon or Keepa. A dated keyword observation can explain collection coverage, but a small or
empty result does not prove that Amazon has few matching Products. Initial gaps are accepted.
Text searches register keyword candidates without granting a standing collection subscription.
Background admission and adaptive checks grow coverage under measured provider budgets; the search
request stays immediate.

Agents also read individual Products by marketplace and ASIN. Known listing data returns
immediately and can refresh in the background. Only unresolved listings wait for retrieval.
The extension continues to resolve the ASINs visible on the user's Amazon page through Product
lookups and history reads.

Clients that display compact labels can request `include: ['marketData', 'shortName']` on a single public Product get.
For known Merch listings with an available image, RankWrangler inspects the printed design and
selects a supported span from the listing title. The nullable name travels beside the full Product,
so clients can use it for a chip and show Product details on hover. The default single Product get
still waits for current market data; the basic batch does not request market data or image analysis.
The same get can independently include `cutoutThumbnail` to receive a centered transparent 128×128
Product photo for a compact chip. RankWrangler generates it on the first request and reuses it until
the listing image changes. A chip can request both optional fields without `marketData`; the original
listing photo remains available for larger views and as a fallback when no cutout is available.

Integrations that only need listing labels use the public basic Product batch. It accepts up to 200
unique marketplace/ASIN pairs, preserves request order, and returns fixed-shape identity, title,
thumbnail, and Amazon listing status. A deleted listing retains last-known Product values. Every
requested identity joins the canonical catalog. Active Merch Products can enter recurring Keepa
history only after capacity admission; explicit history reads remain available independently.

The dashboard Product drawer remains source-aware and may explain collection provenance and recent
work. That observability is not part of the public Product contract.

**Brief user story:** An agent resolves an ASIN once, then reads the same canonical Product when it
later appears in a different research workflow.

## Boundaries

- Catalog lookup searches stored Products; it is not an Amazon search-results query.
- Current Product state does not preserve where or in what order the Product was discovered.
- Nullable measurements remain unavailable rather than being inferred or converted to zero.
- RankWrangler exposes evidence for opportunity assessment, not an opportunity verdict.
