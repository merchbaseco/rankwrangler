---
summary: Explains how observed Amazon listings become canonical Products and remain source-current.
read_when:
  - tracing how browser, dashboard, API, SP-API, or Keepa activity adds a Product
  - changing the user-visible meaning of Product discovery or freshness
---

# Product Ingestion

**Status:** Discovery, SP-API ingestion, source-separated Keepa current metrics, and nullable
Merch-listing classification are implemented. Apply the generated Product-schema migration before
deployment.

Ingestion turns an observed marketplace/ASIN into canonical Product state. Every path uses the same
Product identity, so repeated observations enrich or refresh a record instead of creating a second
kind of Product.

## Discovery paths

| Path | User-visible behavior |
| --- | --- |
| Browser extension | Recognized Amazon search cards and detail pages request Product summaries and show BSR context. Missing or stale summaries are persisted. |
| Product lookup | Dashboard, public API, and CLI ASIN reads use shared blocking Product retrieval. |
| Dashboard Amazon results | Selecting a Top Search Term fetches current search rows and passes their ASINs through shared background Product retrieval. |
| Keepa ingestion | Rich Product/history reads and scheduled refreshes normalize accepted Keepa Product data into the same Product and history records. |
| Keepa Catalog search | One first-page response imports Keepa observations and histories, preserves Search-run membership, and leaves Product enrichment to shared background retrieval on run reads. |

SP-API and Keepa adapters extract listing description evidence for one shared deterministic Merch
classifier. Keepa adds separately attributed current metrics and event history. A Keepa write
advances its freshness watermark only after the Product, history, and import audit persist
successfully.

The listing synchronization queue batches ASINs and deduplicates marketplace/ASIN work. If the
provider returns no listing, RankWrangler retains the canonical identity, records durable resolution,
and returns an unavailable thumbnail state.

Keyword-research rows remain useful while background work runs: retained placement and metrics stay
visible, while a pending thumbnail marks unresolved Product data. Product completion refreshes only
the affected exact ASIN. Public Search waits for the same enrichment and returns only resolved
available or unavailable thumbnails.

**Brief user story:** A seller browses Amazon with the extension; each recognized listing becomes
available later to an agent through RankWrangler's stored catalog.

## Boundaries

- Discovery means RankWrangler observed a Product, not that the Product is promising.
- Browser caching avoids unnecessary page-time requests; it does not replace server persistence.
- Source timestamps are independent. Fresh SP-API description data does not imply fresh Keepa
  metrics, and vice versa.
- External search membership and position require a Search run; canonical Product state cannot
  reconstruct them.
