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

Adapters report bullet evidence with an explicit availability distinction:

- **Available:** a bullet array is present, including an empty `[]`. The classifier runs; `[]`
  produces `false`.
- **Unavailable:** no bullet evidence is available. The classifier produces no result, and
  persistence treats the observation as a no-op.

One source-neutral deterministic classifier consumes available evidence from both SP-API and Keepa.
The provider adapters extract evidence at their source boundaries; the shared classifier owns
template matching and seller-bullet extraction. Keepa Catalog search classifies from the bullet
evidence returned in that search immediately; it does not wait for SP-API. SP-API uses the same
classifier.

Persistence reconciliation follows these rules:

- `true` is monotonic and is never downgraded by later `false` evidence.
- `false` is revisable: later available evidence may change it to `true`.
- Unavailable evidence never changes stored or public classification knowledge.
- Existing `false` rows remain `false`; rollout does not reset them to `null`.

The owning Product upserts reconcile these rules atomically on the marketplace/ASIN conflict path,
so concurrent provider writes cannot downgrade an already-known `true` value.

The public Product shape exposes no Merch-classification provider, freshness, or status metadata.
The nullable field is the complete public knowledge contract; Top Search Terms' separate
`isMerchRelevant` classifier is outside this decision.

## Consequences

- Consumers distinguish known non-Merch (`false`) from not-yet-classified (`null`).
- Keepa-first search results can carry Merch knowledge without a second SP-API wait.
- Provider adapters remain evidence extractors, while classification and Product reconciliation have
  one shared ownership boundary.
