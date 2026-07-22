---
summary: Explains how observed Amazon listings become canonical Products and remain source-current.
read_when:
  - tracing how browser, dashboard, API, SP-API, or Keepa activity adds a Product
  - changing the user-visible meaning of Product discovery or freshness
---

# Product Ingestion

**Status:** Discovery and SP-API ingestion are current. Source-separated Keepa current metrics
require the generated Product-schema migration before deployment.

Ingestion turns an observed marketplace/ASIN into canonical Product state. Every path uses the same
Product identity, so repeated observations enrich or refresh a record instead of creating a second
kind of Product.

## Discovery paths

| Path | User-visible behavior |
| --- | --- |
| Browser extension | Recognized Amazon search cards and detail pages request Product summaries and show BSR context. Missing or stale summaries are persisted. |
| Product lookup | Dashboard, public API, and CLI ASIN reads resolve stored data or fetch SP-API data when needed. |
| Dashboard Amazon results | Selecting a Top Search Term fetches current SP-API results and queues their ASINs for canonical Product synchronization. |
| Keepa ingestion | Rich Product/history reads and scheduled refreshes normalize accepted Keepa Product data into the same Product and history records. |

SP-API owns listing description fields and the deterministic Merch signal. Keepa adds separately
attributed current metrics and event history. A Keepa write advances its freshness watermark only
after the Product, history, and import audit persist successfully.

The SP-API synchronization queue batches ASINs and deduplicates marketplace/ASIN work. If Amazon no
longer returns a queued listing, RankWrangler removes the corresponding Product and records that
activity.

**Brief user story:** A seller browses Amazon with the extension; each recognized listing becomes
available later to an agent through RankWrangler's stored catalog.

## Boundaries

- Discovery means RankWrangler observed a Product, not that the Product is promising.
- Browser caching avoids unnecessary page-time requests; it does not replace server persistence.
- Source timestamps are independent. Fresh SP-API description data does not imply fresh Keepa
  metrics, and vice versa.
- External search membership and position require a Search run; canonical Product state cannot
  reconstruct them.
