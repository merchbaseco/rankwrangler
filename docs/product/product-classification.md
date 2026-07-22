---
summary: Defines Merch detection and the optional facets used to organize stored Products.
read_when:
  - interpreting isMerchListing or Product facet badges
  - changing Merch detection, niche filters, or facet classification behavior
---

# Product Classification

RankWrangler has two separate classifications: a deterministic Merch-listing signal and optional
AI-generated facets. Neither is an opportunity score.

## Merch listing signal

`isMerchListing` is derived from known Merch template language in Amazon listing bullets. For a
recognized Merch listing, RankWrangler also preserves the seller-authored bullets after removing
template text.

The signal controls workflows such as scheduled Keepa refresh eligibility. It describes listing
type, not sales quality or intellectual-property safety.

## Product facets

Facets organize design intent into a fixed taxonomy:

`profession`, `hobby`, `animal`, `food`, `cause`, `identity`, `culture`, `holiday`, `occasion`,
`place`, and `party-theme`.

The classifier considers listing text and, when available, the thumbnail. Values are normalized to
lowercase dash-separated labels and stored as reusable facet values. The dashboard displays them as
badges and offers catalog filters across all assigned values.

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
