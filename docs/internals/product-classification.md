---
summary: Defines deterministic Merch-listing detection and model-assisted semantic Product facets as separate classifications.
read_when:
  - changing Merch detection, seller bullet extraction, facet taxonomy, or Gemini classification
  - diagnosing pending, ready, or error facet state
---

# Product Classification

RankWrangler has two distinct Product classifications: deterministic Merch detection during SP-API
ingestion, and model-assisted semantic facets after a Product exists.

## Merch Detection

SP-API bullet points are normalized and compared with known Amazon Merch template bullets. A
matching template marks `isMerchListing = true`. For matching listings, up to two non-template
seller bullets are retained as `bullet1` and `bullet2`.

This classification is deterministic and source-derived. It controls workflows such as scheduled
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
Classification requires `GEMINI_API_KEY`; image download failure falls back to text-only input.

## Invariants

- Merch detection and facets answer different questions and must not share one state flag.
- Facets describe Product subject matter; they do not score demand or recommend an action.
- A successful facet write replaces the complete facet set for the Product.
- Success and failure emit `product.facets.classify` activity events.

