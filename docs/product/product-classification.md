---
summary: Defines public Merch-listing knowledge and the optional facets used to organize stored Products.
read_when:
  - interpreting isMerchListing or Product facet badges
  - changing Merch-listing classification, niche filters, or facet classification behavior
---

# Product Classification

**Merch-listing status:** Shipped. Product facets below describe shipped behavior.

RankWrangler has two separate Product classification concerns: a deterministic Merch-listing
classification and optional AI-generated facets. Neither is an opportunity score.

See the shipped [Merch-listing classification decision](../decisions/merch-listing-classification.md)
for evidence availability and persistence reconciliation.

## Merch-listing knowledge

Product truth is binary, while public knowledge is `isMerchListing: boolean | null`:

| Value | Meaning |
| --- | --- |
| `true` | The listing's part number is a Merch on Demand design code, or a bullet matches Merch template language. |
| `false` | The classifier saw the listing's part number or bullets and found neither Merch signal. |
| `null` | RankWrangler has no Merch-listing classification knowledge for the Product yet. |

Recognition covers every Merch on Demand product type, including shirts, hoodies, jerseys, hats,
PopSockets, phone cases, totes, pillows, posters, drinkware and journals. A Merch-style title alone
does not count, because other sellers copy those titles. A new unclassified Product starts at
`null`. For a recognized Merch listing, RankWrangler also preserves the seller-authored bullets
after removing template text.

The dashboard Products page shows Merch listings by default; its Listing Type filter switches to
all listings, known non-Merch, or unknown.

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
