---
summary: Defines source-neutral Merch-listing classification and model-assisted semantic Product facets as separate classifications.
read_when:
  - changing Merch-listing classification, bullet evidence, facet taxonomy, or Gemini classification
  - diagnosing pending, ready, or error facet state
---

# Product Classification

**Merch-listing status:** Shipped. Semantic facets below describe shipped behavior.

RankWrangler has two distinct Product classifications: deterministic Merch-listing classification
from source bullet evidence, and model-assisted semantic facets after a Product exists.

## Merch-Listing Classification

The shipped [Merch-listing classification decision](../decisions/merch-listing-classification.md)
defines binary Product truth and nullable classification knowledge. Adapters own bullet extraction,
not classification. Each adapter reports either available bullet evidence, including `[]`, or
unavailable evidence.

SP-API and Keepa feed one source-neutral deterministic classifier. Keepa Catalog search classifies
immediately from returned bullet evidence before Product persistence and does not wait for SP-API.

| Evidence and result | Persistence reconciliation |
| --- | --- |
| Available, `true` | Store `true`; a later result never downgrades it. |
| Available, `false` | Store or retain `false` unless knowledge is already `true`; later available evidence may revise it to `true`. |
| Unavailable | No-op. |

Every new unclassified Product starts with `isMerchListing: null`. Existing `false` rows remain
`false`; rollout does not reset them to `null`. The public field exposes no provider, freshness, or
status metadata. For recognized listings, up to two non-template seller bullets are retained as
`bullet1` and `bullet2`.

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
