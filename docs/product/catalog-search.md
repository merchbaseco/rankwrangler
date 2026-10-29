---
summary: Defines dated keyword search observations and their separation from current catalog search.
read_when:
  - interpreting keyword.results or retained Search-run placement
  - deciding whether a request reads the Product database or collects external keyword evidence
---

# Keyword search observations

**Implementation status:** The split between `product.search` and `keyword.results` is prepared
in source. Database migration and production deployment are pending.

`product.search` searches the current [Product catalog](product-catalog.md). `keyword.results`
answers a different question, what the external source returned for a keyword when it was checked.
It preserves the existing external-search capability under a keyword-specific name.

## Dated results

Keyword results cover the US first page with up to 20 Products. The response includes the keyword,
observation time, source-supplied placement, and compact current Product values. A source-supplied
placement is useful evidence, not a guarantee of Amazon organic rank. Invalid or duplicate rows
leave gaps. Retained membership and placement never change, while current Product values can.

A successful observation is reused for 24 hours. A missing or expired observation starts or joins
collection, then waits for the run and Product enrichment. Explicit refresh requests a replacement
run. Provider failures and caller deadlines preserve the existing retryable error behavior.

The Keywords dashboard shows the stored directory and its collection lifecycle. Dated Amazon
search results remain available through keyword.results.

## Collection boundaries

The existing external keyword-results request renews keyword interest for 30 days, including reuse.
Admitted keywords receive adaptive checks based on demand and observed change. A normal database
Product search records interest without extending that research lease or dispatching provider work.

Background exploration follows SP-API continuation tokens under daily request caps, adding Products
to the same catalog. Search coverage distinguishes first-page keyword evidence from dated exploration.
Neither source promises exhaustive Amazon coverage or continuous rank tracking. New listings do not
automatically receive recurring history; history admission protects useful existing work and budget.
RankWrangler exposes research evidence without scoring niches or recommending designs.

See [Public API](../reference/public-api.md#keyword-results) for the request and response contract.
