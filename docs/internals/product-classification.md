---
summary: Defines source-neutral Merch-listing classification and model-assisted semantic Product facets as separate classifications.
read_when:
  - changing Merch-listing classification, bullet evidence, facet taxonomy, or Gemini classification
  - diagnosing pending, ready, or error facet state
---

# Product Classification

**Merch-listing status:** Shipped. Semantic facets below describe shipped behavior.

RankWrangler has two distinct Product classifications: deterministic Merch-listing classification
from source part-number and bullet evidence, and model-assisted semantic facets after a Product
exists.

## Merch-Listing Classification

The shipped [Merch-listing classification decision](../decisions/merch-listing-classification.md)
defines binary Product truth and nullable classification knowledge. Adapters own evidence
extraction, not classification. Each adapter reports the listing part number (SP-API
`part_number`, Keepa `partNumber`, or `null`) and either available bullet evidence, including `[]`,
or unavailable evidence.

`classifyMerchListing` (`services/merch-listing-classification.ts`) decides:

1. **Part-number fingerprint.** Merch assigns every listing an 11-character uppercase alphanumeric
   design code with at least one letter, sometimes followed by a 10-character `B0…` suffix
   (`AFCHRPAT1KY`, `G816D85AV0HB07535YF3H`). On production samples it matched 60/60 known Merch
   listings and 0/60 other listings (`GIL1100MDWHTP6-01-White-M`, `105484`, `9781607749707`).
2. **Template bullets.** Any bullet matching a Merch on Demand product-spec bullet after case and
   punctuation normalization. `services/merch-template-bullets.ts` groups the templates by product
   type (shirts, jerseys, sweatshirts, jackets, hats, backpacks, PopSockets, phone cases, totes,
   laptop sleeves, mouse pads, pillows, posters, drinkware, journals). Generic seller copy such as
   "Funny design." or size-chart notices is excluded.
3. Otherwise `false` when a part number or available bullets exist, and no result when neither does.

Titles are not evidence: licensed and other print-on-demand sellers copy Merch title suffixes such as
"Premium T-Shirt".

SP-API and Keepa feed one source-neutral deterministic classifier. Keepa Catalog search classifies
immediately from returned bullet evidence before Product persistence and does not wait for SP-API.

| Evidence and result | Persistence reconciliation |
| --- | --- |
| `true` | Store `true`; a later result never downgrades it. |
| `false` | Store or retain `false` unless knowledge is already `true`; later evidence may revise it to `true`. |
| No result | No-op. |

Every new unclassified Product starts with `isMerchListing: null`. Existing `false` rows remain
`false` until new evidence says otherwise. The public field exposes no provider, freshness, or
status metadata. For every recognized listing, whichever signal matched, template bullets are
dropped and up to two remaining seller bullets are retained as `bullet1` and `bullet2`.

### Reclassification

`bun run merch:reclassify` (from `apps/server`, wrapped in `varlock run`) re-fetches active US
Products whose stored knowledge is not `true`, 20 ASINs per SP-API `searchCatalogItems` call, and
writes them through the ordinary Product upsert so reconciliation applies. It spends background
Catalog capacity, yields to foreground lookups and waits while automatic sync is paused. Flags:
`--dry-run` prints `before->after` transition counts without writing, `--include-merch` also
refreshes known Merch rows, `--after <ASIN>` resumes, and `--limit <n>` bounds the run. ASINs the
provider does not return are counted as `missing` and left untouched.

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
