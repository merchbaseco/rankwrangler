---
summary: Defines the public Merch-listing status and the optional facets used to organize stored Products.
read_when:
  - interpreting isMerchListing or Product facet badges
  - changing Merch-listing classification, niche filters, or facet classification behavior
---

# Product Classification

**Merch-listing status:** Shipped. Product facets below describe shipped behavior.

RankWrangler has two separate Product classification concerns: a deterministic Merch-listing
classification and optional AI-generated facets. Neither is an opportunity score.

See the shipped [Merch-listing classification decision](../decisions/merch-listing-classification.md)
for the evidence, the package-profile table and how observations reconcile.

## Merch-listing status

`isMerchListing` is always `true` or `false`:

| Value | Meaning |
| --- | --- |
| `true` | A bullet matches Merch template language, or the listing has no UPC, EAN or GTIN and the catalog attributes Merch sets, with a Merch package or none of the attributes sellers set. |
| `false` | Anything else, including a Product no provider has described yet. |

Recognition covers every Merch on Demand product type, including shirts, hoodies, jerseys, hats,
PopSockets, phone cases, totes, pillows, posters, drinkware, journals and pens. A Merch-style title
or a design-code-shaped part number does not count, because other sellers share both. Licensed
Merch with a UPC and older Merch whose bullets Amazon rewrote both count. A variation
parent without either signal takes its first variant's verdict. The latest observation wins, so a
listing can move from Merch to non-Merch. For a Merch listing, RankWrangler also preserves the
seller-authored bullets after removing template text.

The dashboard Explore grid shows Merch listings by default; its Listing type filter switches to
all listings or non-Merch.

The signal controls workflows such as scheduled Keepa refresh eligibility. It describes listing
type, not sales quality or intellectual-property safety.

The public Product shape does not expose the evidence provider, classification freshness, or
classification status.

## Product facets

Facets organize design intent into a fixed taxonomy:

`profession`, `hobby`, `animal`, `food`, `cause`, `identity`, `culture`, `holiday`, `occasion`,
`place`, and `party-theme`.

The facet classifier considers listing text and, when available, the thumbnail. Values are
normalized to lowercase dash-separated labels and stored as reusable facet values. The dashboard
displays them as badges and offers catalog filters across all assigned values.

Facet classification is explicitly requested by an administrator today. The background classifier
is disabled, so a Product in `pending` state is unclassified rather than silently complete. Failed
classification is visible as `error` and can be retried.

**Brief user story:** A researcher filters the catalog to `hobby:fishing` and
`occasion:fathers-day`, then inspects the underlying Products rather than trusting a composite
score.

## Boundaries

- Facets are normalized interpretations, not source facts from Amazon.
- Empty facets are valid; the classifier should prefer no label to a weak label.
- Classification does not decide whether a phrase is safe to use or whether a niche is attractive.
