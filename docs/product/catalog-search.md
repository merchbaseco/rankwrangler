---
summary: Defines the accepted external Amazon catalog-search experience for agents and the dashboard.
read_when:
  - planning or implementing Catalog queries, Search runs, or tracked searches
  - deciding whether a request is stored catalog lookup or external Amazon catalog search
---

# Catalog Search

**Status:** On-demand Keepa Catalog search and immutable run-history reads are available through
the app/public API, typed client, and CLI. Weekly tracking remains a future slice.

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
- A successful run can be reused for 24 hours by default. A caller can request fresh data, while an
  identical in-flight request still deduplicates.
- Queries remain on demand until a human or agent explicitly enables weekly tracking. Manual fresh
  runs satisfy the weekly collection window; cached reads do not.

Search work is asynchronous. A request returns either a reusable Search run or a pending Operation
with a retry hint. Agents wait, poll the Operation, then read its referenced run. The dashboard owns
polling and may also invalidate reads after a domain-specific completion event; it shows a loading
state, not an internal `queued` state.

Existing-query and run-history reads never contact Keepa. Query state includes identity, latest-run
metadata, and whether tracking is enabled. Run pages are bounded, newest-first, and include
successful empty runs. A run result keeps immutable `observed` values and a source-qualified
position; `currentProduct` is a separate nullable view of today's canonical Product.

**Brief user story:** An agent searches `retro gardening shirt`, waits for completion, and compares
eight weekly runs by result membership, source position, BSR, and bought-in-the-past-month evidence.

## Boundaries

- Source position is not called Amazon organic rank unless the provider guarantees that meaning.
- Search does not score niches, infer intent, or recommend a design.
- Tracking is never enabled from popularity, request count, or inferred seasonality.
- Keepa tokens, refill timing, and provider scheduling stay internal.
- V1 does not include private tenant queries, additional pages or marketplaces, arbitrary cadences,
  or raw Keepa payload retention.

See [the accepted architecture decision](../decisions/catalog-search.md) for the storage and
lifecycle tradeoffs.
