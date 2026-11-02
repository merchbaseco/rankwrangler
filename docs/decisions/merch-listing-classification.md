---
summary: Records the binary Merch-listing contract, the template-bullet, package-profile and listing-attribute rule, the variation-parent fallback, and latest-wins persistence.
read_when:
  - changing Product Merch-listing classification or Merch evidence extraction
  - adding a Merch template bullet or package profile
  - deciding how Keepa and SP-API observations reconcile with public isMerchListing
---

# Merch-Listing Classification

Status: Shipped
Date: 2026-11-01 (supersedes the 2026-08-07 nullable, part-number contract); amended 2026-11-02

The public Product contract is summarized in [Product classification](../product/product-classification.md).

## Decision

A Product is a Merch listing or it is not. Stored and public `isMerchListing` is a plain boolean;
there is no `null` and no `unknown` filter. `products.is_merch_listing` is `NOT NULL DEFAULT false`,
so a Product no observation has decided yet reads as non-Merch.

One observation is one SP-API catalog item or one Keepa product. It is Merch exactly when either:

1. a bullet equals a Merch on Demand template bullet after punctuation and case normalization
   (`apps/server/src/services/merch-template-bullets.ts`), whatever else the listing carries; or
2. it carries no product identifier (UPC, EAN or GTIN), has the Merch listing attributes
   (`manufacturer`, `part_number` and `list_price`), and either
   - its package dimensions and weight match a Merch package profile
     (`apps/server/src/services/merch-package-profiles.ts`), or
   - it is not a variation parent and has no seller attributes: `product_description`,
     `batteries_required`, `supplier_declared_dg_hz_regulation`,
     `supplier_declared_has_product_identifier_exemption`, `skip_offer` or `title_differentiation`.

The Merch on Demand pipeline stamps each listing with its product type's template bullets and
package profile, and sets a manufacturer, part number and list price but none of the seller
attributes. No seller listing in the validation set copied a template bullet, so a template bullet
decides alone. A Merch listing keeps its first two non-template bullets as seller bullets; a
non-Merch listing keeps none.

### Package profiles

Dimensions are sorted ascending, in inches; weight is in pounds. A match allows ±0.06 in per
dimension and ±0.01 lb.

| Dimensions | Weight | Merch product types |
| --- | --- | --- |
| 1 × 8 × 10 | 0.3 | standard, premium, V-neck, tank, tri-blend, performance, heavyweight and kids tees; polo |
| 1 × 10 × 10 | 0.3 | Comfort Colors tee, crop top |
| 2 × 10 × 10 | 0.3 | raglan |
| 2 × 10 × 10 | 0.5 | long sleeve, quarter-zip |
| 1 × 9 × 10 | 0.3 | jersey |
| 3 × 10 × 12 | 1.0 | crewneck and crop sweatshirt |
| 5 × 12 × 12 | 1.3 | pullover and zip hoodie, jacket |
| 0.3 × 3.4 × 4.3 | 0.03 | PopSockets |
| 0.75 × 4.75 × 7.75 | 0.34 | phone case |
| 5 × 5 × 6 | 0.34 | mug |
| 3.7 × 3.78 × 7.28 | 0.723 | tumbler |
| 3.4 × 4 × 11.4 | 0.961 | water bottle |
| 0.6 × 5.1 × 8.25 | 0.787 | hardcover journal |
| 1 × 6.75 × 10 | 0.3 | pens |
| 3 × 3 × 20 | 0.5 | poster |
| 0.5 × 8 × 10 | 0.5 | mouse pad |
| 1 × 12 × 16 | 0.7 | laptop sleeve |
| 3 × 16 × 22 | 1.8 | backpack |
| 5 × 7 × 9 | 0.38 | hat |
| 2 × 9.5 × 14.5 | 0.7 | tote |
| 5 × 6 × 8 | 1.0 | crossbody bag |
| 7 × 10 × 18 | 1.1 | throw pillow |

SP-API reports inches, centimeters or millimeters and pounds, kilograms, grams or ounces. A unit
outside these, or a missing or non-positive measurement, means no profile. 2.54 × 20.32 × 25.4 cm
and 0.136 kg is the 1 × 8 × 10 in, 0.3 lb profile.

When a non-parent SP-API item has a template bullet but a package no profile matches, the server
logs a `[Merch Classification]` warning with the ASIN and the converted package. That flags a new
or repackaged Merch product type whose row the table is missing.

### Evidence extraction

Adapters extract evidence at their source boundary; the shared classifier owns the rule.

- **SP-API:** bullets from `attributes.bullet_point`; a product identifier when
  `identifiers[].identifiers` is non-empty or `attributes.externally_assigned_product_identifier`
  exists; the package from `attributes.item_package_dimensions[0]` and
  `attributes.item_package_weight[0]`; the listing and seller attributes by presence in the
  marketplace. Every catalog request includes `identifiers`.
- **Keepa:** bullets from `features`; a product identifier when `upcList` or `eanList` is
  non-empty. Keepa reports none of the listing attributes, so its package is not evidence.

### Variation parents

Most variation parents carry no package data. On SP-API, a parent (`summaries[].itemClassification`
is `VARIATION_PARENT`, or it lists `childAsins`) that is not Merch by its own evidence, has no
product identifier and no `product_description` takes the verdict of its first child
(`relationships[].childAsins[0]`), seller bullets included. The children come from the ASIN catalog
search, at most 20 per request and at the original call's priority; a child already in the same
response is reused. If the child isn't returned, the parent's own `false` stands. One helper
(`apps/server/src/services/spapi/classify-catalog-items.ts`) applies this to the ASIN lookup,
keyword discovery and the dashboard keyword search.

Keepa sees only bullets and identifiers, so a Keepa observation decides Merch from a template
bullet and non-Merch from a product identifier without one. A product identifier decides nothing
when Keepa saw no whole listing: `productType` 5 (a variation parent), 3 (Keepa could not access the
product) or 4 (an invalid ASIN). Every other Keepa observation is undecided and leaves the verdict
to SP-API.

### Persistence: the latest decided observation wins

- A decided observation overwrites the stored status and seller bullets, so `true` can become
  `false`. SP-API observations always decide. Keepa decides only what SP-API would decide the same
  way, so the two never alternate a Product's status.
- An undecided Keepa observation leaves a stored Product's status and bullets untouched and inserts
  a new Product as non-Merch.
- Every variant observation writes to its family row, so the family follows whichever variant was
  observed last.
- A status change notifies the keyword directory rows that list the Product.
- Merging two family rows keeps Merch if either row is Merch.

`bun run merch:reclassify` (from `apps/server`) starts a server job that re-fetches every active US
Product through the ASIN catalog search, so the parent fallback applies, and writes through the
Product upsert, which promotes and demotes alike. It keeps `--dry-run`, `--after <ASIN>` and
`--limit <n>`. The work runs in the server, not the script, because the Catalog limiter lives in
the server process: a script with its own limiter doubled the request rate and drew 429s.

### Why part numbers were dropped

The previous rule also accepted a part number shaped like a Merch design code (11 uppercase
alphanumerics). Many third-party SKUs fit that shape, such as Haloumoning `M7Z659HW120` and the
Phinus ruler `16TXCZZN001`. Because `true` never downgraded and every variant wrote to its family,
one matching observation flagged a whole third-party family as Merch for good. Validated against
about 1,200 SP-API records, the identifier, template and package rule flagged all 151 verified
genuine Merch listings and none of the 63 verified misflags.

### Why listing attributes were added

Run over every active US Product on 2026-11-02, the first rule changed 26 stored verdicts, and the
Merch on Demand badge on the Amazon page contradicted 19 of them:

- Licensed Merch (Marvel, NBC, Attack on Titan) carries a UPC beside the template bullet and the
  standard tee package. The identifier vetoed it.
- Amazon rewrote the bullets of some 2017–2019 Merch listings into two marketing bullets and
  remeasured their packages, leaving no template bullet and no profile. They keep the Merch listing
  attributes and lack every seller attribute.
- Bioworld vendor tees ship in the 1 × 10 × 10 in, 0.3 lb package of the Comfort Colors tee but
  carry a description and a hazmat declaration, and no manufacturer, part number or list price.

The amended rule classifies all of these correctly and keeps every earlier verdict. Badge-checked
samples of about 1,100 stored Products changed only where the badge or a `MerchByAmazon`
manufacturer confirmed Merch. Without the hazmat and battery attributes in the seller set, big-brand
parents such as Under Armour and Polo Ralph Lauren would pass, which is also why parents need a
package profile or defer to their child.

## Consequences

- Consumers read `isMerchListing` as a plain boolean; there is no not-yet-classified state.
- Keepa-first search results carry a Merch verdict only for a template bullet; other new Products
  start non-Merch until SP-API checks them, which the blindspot selection does once.
- A new Merch product type is invisible to the template and package paths until its rows are
  added; the listing-attribute path and the drift warning cover the gap.
- Provider adapters remain evidence extractors, while the rule and the parent fallback have one
  owner each.
