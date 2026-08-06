---
summary: Defines the accepted external Amazon catalog-search experience for agents and the dashboard.
read_when:
  - planning or implementing Catalog queries, Search runs, or keyword refresh
  - deciding whether a request is stored catalog lookup or external Amazon catalog search
---

# Catalog Search

**Status:** Keepa Catalog search, immutable run-history reads, and decaying keyword refresh are
available through the dashboard, app/public API, typed client, and CLI.

Catalog search collects ranked external results and preserves what the source surfaced at a moment
in time. It complements catalog lookup:

| Capability | Meaning |
| --- | --- |
| Catalog lookup | Search RankWrangler's canonical stored Products in their current state. |
| Amazon catalog search | Execute a marketplace query, preserve source order and observed metrics, and reconcile every accepted result with canonical Products. |

## V1 contract

- Keepa Product Search, US marketplace, first page, up to 20 Products.
- One provider request returns the result Products and their histories; RankWrangler does not make
  a follow-up Keepa request per ASIN.
- Results preserve source position plus nullable observed BSR, price, rank averages and drops, and
  Amazon's bought-in-the-past-month value surfaced through Keepa.
- Current views combine run membership and position with canonical Product state. Historical views
  retain the immutable values observed in each run.
- A successful run can be reused for 24 hours by default. Default callers receive older Available
  evidence immediately while RankWrangler revalidates it in the background. `refresh: true` waits
  for a run satisfying the same server-owned 24-hour policy and never forces a provider request.
  Equivalent in-flight requests still deduplicate.
- A product search request renews keyword interest for 30 days, even when it reuses the 24-hour
  cache. This is the only activation event; there is no permanent subscription or manual toggle.
- Active keywords are due for automatic refresh when their latest successful run is at least seven
  days old, or when no successful run exists. Inactive keywords expire automatically and are not
  backfilled. Failed attempts remain observable and retry after bounded backoff.
- Each Search run records `trigger: requested | automatic`. History labels these as Requested
  search or Automatic refresh; Product and `currentProduct` shapes do not carry that field.

Durable Search work remains asynchronous internally, but the public Product-search request is
caller-transparent. `api.public.catalog.search` returns `{ status: "ready", run, freshness }` with
one Search-run freshness envelope, or a provider-neutral retryable error after a bounded wait. It
never returns an Operation identifier or asks a caller to poll. The existing dashboard request route
continues to own its internal Operation-driven loading flow until the cross-surface consolidation.

The dashboard Keyword-research page keeps the active term plus pending Operation and query identities
in the URL, so a reload resumes polling without pairing work with another query. It presents Keepa
source position and immutable observed metrics separately from current canonical Product fields,
preserves earlier successful runs through empty or failed refreshes, and renews keyword activity
when the search request is accepted.

When a result has retained search evidence but no resolved Product thumbnail yet, the dashboard
shows a pending-thumbnail state in that Product row. Product completion swaps in the thumbnail and
listing metadata by refreshing only that exact ASIN; it does not poll or reload the Search-run list.
A completed lookup with no image shows a distinct unavailable-thumbnail state.

Existing-query and run-history reads never contact Keepa. Query state includes identity, activity
timestamps, derived status, observation count, and latest-run metadata. Run pages are bounded,
newest-first, and include successful empty runs. A run result keeps immutable `observed` values and
a source-qualified position; `currentProduct` is a separate nullable view of today's canonical
Product.

**Brief user story:** An agent searches `retro gardening shirt`, waits for completion, and compares
eight weekly runs by result membership, source position, BSR, and bought-in-the-past-month evidence.

## Boundaries

- Source position is not called Amazon organic rank unless the provider guarantees that meaning.
- Search does not score niches, infer intent, or recommend a design.
- Automatic refresh is never enabled from popularity, Brand Analytics Top Search Terms, or inferred
  seasonality; that ingestion remains a separate automatic workflow.
- Keepa tokens, refill timing, and provider scheduling stay internal.
- V1 does not include private tenant queries, additional pages or marketplaces, arbitrary cadences,
  or raw Keepa payload retention.

See [the accepted architecture decision](../decisions/catalog-search.md) for the storage and
lifecycle tradeoffs.
