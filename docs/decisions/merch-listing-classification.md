---
summary: Records the binary Product truth and nullable classification-knowledge contract for Merch-listing classification.
read_when:
  - changing Product Merch-listing classification or bullet-evidence extraction
  - deciding how Keepa and SP-API observations reconcile with public isMerchListing
---

# Merch-Listing Classification

Status: Shipped
Date: 2026-08-07

The public Product contract is summarized in [Product classification](../product/product-classification.md).

## Decision

Product truth is binary: a Product either is a Merch listing or it is not. Persisted and public
classification knowledge is `isMerchListing: boolean | null`. Every new unclassified Product starts
at `null`; `null` means unknown, not non-Merch.

Adapters report the listing's part number, model number and title (each possibly `null`) and
bullet evidence with an explicit availability distinction:

- **Available:** a bullet array is present, including an empty `[]`.
- **Unavailable:** no bullet evidence is available.

The classifier returns `true` when any bullet matches a known Merch on Demand template bullet, or
when the part number matches the Merch design-code fingerprint (11 uppercase alphanumeric
characters with at least one letter and never six digits in a row, optionally followed by a
10-character `B0…` suffix) on a listing with no model number whose title names a Merch product. It
returns `false` when there is a part number or available bullets and neither rule holds, and no
result when there is neither a part number nor available bullets; persistence treats that
observation as a no-op.

The part-number fingerprint alone also fits structured catalog codes such as `YES33194325`,
`ULGS322B01S`, `FG3H8900WHT` and `MINGLUO0121` (books, furniture, closet kits, buttons). In samples
Merch listings never carried a model number (0 of 60) and always named their product in the title,
so those two conditions gate the part-number path. A title alone is never evidence: licensed and
other print-on-demand sellers copy Merch title suffixes.

One source-neutral deterministic classifier consumes available evidence from both SP-API and Keepa.
The provider adapters extract evidence at their source boundaries (SP-API `part_number` and
`bullet_point` attributes, Keepa `partNumber` and `features`); the shared classifier owns the
part-number fingerprint, template matching and seller-bullet extraction. Keepa Catalog search classifies from the bullet
evidence returned in that search immediately; it does not wait for SP-API. SP-API uses the same
classifier.

Persistence reconciliation follows these rules:

- `true` is monotonic and is never downgraded by later `false` evidence.
- `false` is revisable: later available evidence may change it to `true`.
- Unavailable evidence never changes stored or public classification knowledge.
- Existing `false` rows remain `false`; rollout does not reset them to `null`. The one-off
  `merch:reclassify` script re-fetches stored non-Merch and unknown US Products so new evidence can
  upgrade them.

The owning Product upserts reconcile these rules atomically on the marketplace/ASIN conflict path,
so concurrent provider writes cannot downgrade an already-known `true` value.

The public Product shape exposes no Merch-classification provider, freshness, or status metadata.
The nullable field is the complete public knowledge contract; Top Search Terms' separate
`isMerchRelevant` classifier is outside this decision.

Products are variation families (see [Product catalog](../internals/product-catalog.md)). A
variation parent carries the bare 11-character design code as its part number and seller bullets but
no template bullets, so it classifies through the part-number path; a variant carries the template
bullets and the design code with a `B0…` suffix. Both write to the family row, and `true` stays
sticky whichever arrives first.

## Consequences

- Consumers distinguish known non-Merch (`false`) from not-yet-classified (`null`).
- Keepa-first search results can carry Merch knowledge without a second SP-API wait.
- Provider adapters remain evidence extractors, while classification and Product reconciliation have
  one shared ownership boundary.
