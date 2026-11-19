---
summary: Defines dated keyword search observations and how Product search uses them for keyword position and the live fallback.
read_when:
  - interpreting keywordPosition or retained Search-run placement
  - deciding whether a request reads the Product database or collects external keyword evidence
---

# Keyword search observations

`product.search` searches the current [Product catalog](product-catalog.md). A keyword search
observation answers a different question: what Amazon's first page returned for a keyword when it
was checked. Observations are retained as Search runs and reach public callers in two ways only.

## Keyword position

Each Product search item carries `keywordPosition`, the Product's position in the newest stored
first-page observation of exactly the searched term. It covers the US first page, up to 20
Products. A source-supplied placement is useful evidence, not a guarantee of Amazon organic rank.
Invalid or duplicate rows leave gaps. Retained membership and placement never change, while the
Product values beside them are current. `relevance` sorts placed Products first, best position
first.

## Live fallback

A first page that finds nothing for a term with no stored observation starts or joins that
term's collection, waits for it and for resolution of Products RankWrangler has never seen, then
searches the stored catalog again. A niche the catalog has not seen yet therefore answers on the
first call. Every other search answers from stored data at once. Provider failures and caller
deadlines produce the shared retryable error. The dashboard's search never collects.

The Keywords dashboard shows the stored directory and its collection lifecycle.

## Collection boundaries

A fallback collection renews keyword interest for 30 days. Admitted keywords receive adaptive
checks based on demand and observed change. A normal Product search records interest without
extending that research lease or dispatching provider work.

Background exploration follows SP-API continuation tokens under daily request caps, adding Products
to the same catalog. Search coverage distinguishes first-page keyword evidence from dated exploration.
Neither source promises exhaustive Amazon coverage or continuous rank tracking. New listings do not
automatically receive recurring history; history admission protects useful existing work and budget.
RankWrangler exposes research evidence without scoring niches or recommending designs.

See [Public API](../reference/public-api.md#product-search) for the request and response contract.
