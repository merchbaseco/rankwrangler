---
summary: Defines source-neutral Merch-listing classification and model-assisted semantic Product facets as separate classifications.
read_when:
  - changing Merch-listing classification, Merch evidence, facet taxonomy, or Gemini classification
  - diagnosing pending, ready, or error facet state
---

# Product Classification

**Merch-listing status:** Shipped. Semantic facets below describe shipped behavior.

RankWrangler has two distinct Product classifications: deterministic Merch-listing classification
from product-identifier, template-bullet and package evidence, and model-assisted semantic facets
after a Product exists.

## Merch-Listing Classification

The [Merch-listing classification decision](../decisions/merch-listing-classification.md) defines
the binary contract, the package-profile table and the variation-parent fallback. Adapters own
evidence extraction, not classification. Each adapter reports `MerchListingEvidence`: the bullets,
whether the listing carries a UPC, EAN or GTIN, and its package profile, if any.

| Source | Bullets | Product identifier | Package |
| --- | --- | --- | --- |
| SP-API | `attributes.bullet_point` | `identifiers[].identifiers` non-empty, or `attributes.externally_assigned_product_identifier` | `attributes.item_package_dimensions[0]`, `attributes.item_package_weight[0]` |
| Keepa | `features` | `upcList` or `eanList` non-empty | `packageLength/Width/Height` (mm), `packageWeight` (g) |

`classifyMerchListing` (`services/merch-listing-classification.ts`) returns `true` exactly when the
listing has no product identifier and either:

1. **Template bullets.** A bullet matches a Merch on Demand product-spec bullet after case and
   punctuation normalization. `services/merch-template-bullets.ts` groups the templates by product
   type (shirts, jerseys, sweatshirts, jackets, hats, backpacks, PopSockets, phone cases, totes,
   laptop sleeves, mouse pads, pillows, posters, drinkware, journals, pens). Generic seller copy
   such as "Funny design." or size-chart notices is excluded.
2. **Package profile.** `services/merch-package-profiles.ts` converts the package to inches and
   pounds, sorts the dimensions, and matches a typed table of Merch product-type profiles within
   ±0.06 in and ±0.01 lb.

Otherwise the listing is non-Merch. Part numbers, model numbers and titles are not evidence:
third-party SKUs share the Merch design-code shape, and other sellers copy Merch title suffixes such
as "Premium T-Shirt".

A Merch listing drops its template bullets and keeps up to two remaining seller bullets as `bullet1`
and `bullet2`; a non-Merch listing keeps none. A non-parent SP-API item with a template bullet and
an unmatched package logs a `[Merch Classification]` warning, the signal to add a profile row.

### Variation parents and Keepa

`spapi/classify-catalog-items.ts` gives an SP-API variation parent that has no Merch evidence of its
own, no product identifier and no `product_description` the verdict of its first child, fetched
through the ASIN catalog search (20 per request, same priority) unless the child is already in the
response. The ASIN lookup, keyword discovery and the dashboard keyword search all classify through
it. Keepa Catalog search classifies immediately from the returned product, before Product
persistence, and does not wait for SP-API. A Keepa observation that is not Merch by its own evidence
is undecided for a variation parent (`productType` 5) or a product Keepa holds no listing data for
(3 or 4).

| Observation | Persistence |
| --- | --- |
| Decided (every SP-API item, most Keepa products) | Overwrite status and seller bullets; `true` can become `false`. |
| Undecided Keepa | Leave a stored Product untouched; insert a new Product as non-Merch. |

New Products start at `isMerchListing: false`. The public field exposes no provider, freshness, or
status metadata.

### Reclassification

`bun run merch:reclassify` (from `apps/server`, wrapped in `varlock run`) re-fetches every active
US Product, whatever its stored status, 20 ASINs per call through `searchCatalogItemsByAsins` so
the parent fallback applies, and writes through the ordinary Product upsert, where the latest
verdict wins. Its calls are background Catalog requests: they yield to foreground lookups and wait
while automatic sync is paused. The script runs its own Catalog limiter in its own process, so
while the server also scans, the two together can exceed the background share until 429s slow
both down. Flags: `--dry-run` prints `before->after` transition counts (`merch`,
`nonMerch`, `missing`) without writing, `--after <ASIN>` resumes, and `--limit <n>` bounds the run.
Each batch logs the ASINs whose status changes. ASINs the provider does not return are counted as
`missing` and left untouched.

Production secrets resolve only on the deploy path, so the server build also emits
`dist/scripts/reclassify-merch-listings.js` (`vite.scripts.config.ts`). Run it inside the
production server container, which carries the environment:

```bash
docker exec rankwrangler-server node dist/scripts/reclassify-merch-listings.js --dry-run --limit 1000
```

This classification is deterministic and evidence-derived. It controls workflows such as scheduled
SP-API and Keepa refresh eligibility; it is not a niche or opportunity judgment.

## Semantic Facets

Facets describe reusable themes in listing text and, when available, the thumbnail:

`profession`, `hobby`, `animal`, `food`, `cause`, `identity`, `culture`, `holiday`, `occasion`,
`place`, and `party-theme`.

Gemini returns arrays under that fixed taxonomy. RankWrangler validates the response, normalizes
facet values, replaces the Product's facet links, and records token/cost diagnostics.

Product facet state is:

| State | Meaning |
| --- | --- |
| `pending` | No accepted facet classification is stored. |
| `ready` | Current facet links were persisted successfully. |
| `error` | The last classification attempt failed. |

The shipped dashboard exposes an admin-only manual classification mutation. The periodic facet
worker is registered but intentionally disabled, so `pending` does not imply automatic processing.
Classification requires `RANKWRANGLER_GEMINI_API_KEY`; image download failure falls back to text-only input.

## Invariants

- Merch-listing classification and facets answer different questions and must not share one state
  flag.
- Facets describe Product subject matter; they do not score demand or recommend an action.
- A successful facet write replaces the complete facet set for the Product.
- Success and failure emit `product.facets.classify` activity events.
