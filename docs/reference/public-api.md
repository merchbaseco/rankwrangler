---
summary: Defines public tRPC authentication, caller-synchronous retrieval, and provider-neutral response shapes.
read_when:
  - calling RankWrangler without the CLI or typed npm client
  - changing public authentication, Product inputs, retrieval output, or API transport
---

# Public API

**Status:** Unified Product search and `keyword.results` describe prepared source changes.
Their database migration and production deployment are pending.

RankWrangler's external API is tRPC over HTTP, not REST. Prefer the
[typed HTTP client](http-client.md) or [CLI](cli.md); use raw HTTP when integrating another runtime.
The hosted agent-tool contract is documented in [Hosted MCP](mcp.md).

## Endpoint And Authentication

The tRPC endpoint is `{origin}/api/{procedure}`. Production origin:
`https://rankwrangler-api.merchbase.co`.

Public integration calls live under `api.public.*`. Opaque OAuth access tokens use
`Authorization: Bearer <access-token>`. Public clients decode `mbk_v1` machine credentials into
`CF-Access-Client-Id` and `CF-Access-Client-Secret` headers; the envelope itself is not a bearer token.
Chrome and Safari use Managed OAuth against the API host. Requests carrying native secret headers
must not follow redirects.

Invalid or absent credentials produce `UNAUTHORIZED`; denied centralized access produces
`FORBIDDEN`; unavailable centralized access produces `SERVICE_UNAVAILABLE`; exhausted allowance
produces `TOO_MANY_REQUESTS` with a retry hint. Missing Products produce `NOT_FOUND`. Retryable
provider failure or request deadline exhaustion produces `TIMEOUT` with a provider-neutral message
and retry hint. Dashboard `api.app.*` procedures are separate interactive Cloudflare contracts.

## Retrieval Contract

Product search reads the stored catalog without contacting or waiting for providers. Other
retrieval capabilities own their freshness policies. Missing or policy-expired data can start or
join durable work and wait. Caller deadline exhaustion does not cancel that work, and a
retry coalesces with it.

Product `get` and `getMany` serve last-known listing data for any Product with a resolved listing:
a policy-expired read returns the stored title, thumbnail, and `amazonListingStatus` immediately and
queues a deduplicated background refresh. Only Products with no resolved listing wait, bounded by
the caller deadline. See [Public Retrieval](../decisions/public-retrieval.md).

Product `get`/`getMany`/`history`, Product search, and keyword directory inputs have no
refresh control. `keyword.results` separately accepts `refresh`. Product `get`/`getMany`/`history` and keyword responses expose no
pending data, freshness, Operations, polling state, provider status or response `schemaVersion`.

## Procedures

| Procedure | Transport | Result |
| --- | --- | --- |
| `api.public.product.get` | mutation | One current Product. |
| `api.public.product.getMany` | mutation | Basic listing results for up to 200 Product identities. |
| `api.public.product.search` | query | Paginated stored Products and keyword coverage. |
| `api.public.product.history` | mutation | Product sales-rank and price series. |
| `api.public.keyword.get` | query | One stored keyword directory entry. |
| `api.public.keyword.search` | query | Paginated keyword directory entries and collection status. |
| `api.public.keyword.results` | mutation | Dated external search results with retained placement. |

There is no public Catalog, Operation, polling, or provider-health namespace.

## Product

`product.get` accepts `marketplaceId`, a ten-character alphanumeric `asin` normalized to uppercase,
and optional `include: Array<'marketData' | 'shortName' | 'cutoutThumbnail'>` (default `['marketData']`). It returns one Product rather than a
summary/history composite:

```ts
type Product = {
    marketplaceId: string;
    asin: string;
    listing: {
        title: string | null;
        shortName: string | null;
        cutoutThumbnail:
            | { status: 'available'; url: string }
            | { status: 'unavailable' }
            | null;
        brand: string | null;
        firstAvailableAt: string | null;
        bulletPoints: string[];
        thumbnail:
            | { status: 'available'; url: string }
            | { status: 'unavailable' };
        isMerchListing: boolean | null;
        amazonListingStatus: 'active' | 'deleted';
    };
    category: { id: number; name: string | null } | null;
    salesRank: {
        current: number | null;
        averages: {
            last30Days: number | null;
            last90Days: number | null;
        };
    };
    price: { amountMinor: number; currencyCode: string } | null;
    demand: {
        boughtInPastMonth: number | null;
        salesRankDrops: {
            last30Days: number | null;
            last90Days: number | null;
            last180Days: number | null;
            last365Days: number | null;
        };
    };
};
```

`bulletPoints` is always an array; a current Product with no bullets returns `[]`. For nullable
measurements, `null` means valid data is unavailable. It never means zero, failure, or pending work.
`isMerchListing` is RankWrangler classification from bullet evidence supplied through either source;
`null` means the Product has not been classified from available evidence. A Sales-rank drop is an
observed numeric BSR improvement, not a confirmed sale.

`marketData` checks current Keepa-backed rank, price, and demand data under the existing retrieval
policy. Omitting it skips that Keepa history check and returns nullable rank, price, and demand
measurements as `null`; `product.history` remains the separate parameterized history-series read.
The default preserves existing single-Product behavior. `listing.shortName` is `null` unless the
caller includes `shortName` and the Product is a known Merch listing with an available image.
Requested reads inspect the printed design with Gemini 3.1 Flash-Lite,
then use Jev to select a word-for-word span from the listing title with display capitalization.
The name includes pictured context when the printed words alone are generic. A design can still
yield `null` when no title span is supported by the image. The full Product remains in the same
response for detail views; `getMany`, search, and history do not perform this image analysis. A requested short name is
stored per Product and reused while its title, image URL, and generator version are unchanged.

`cutoutThumbnail` independently requests a transparent 128×128 WebP of the Product photo. The visible
subject is cropped to its alpha bounds, scaled to fit, and centered. It is `null` when omitted,
available with a CDN URL when generated, and unavailable when the source image cannot be processed
or generation fails. The original `thumbnail` remains the listing photo. A requested cutout is
stored in R2 and reused while the source URL and generator version are unchanged;
generation failures do not prevent the Product or a requested short name from returning. A caller
displaying chips can request `include: ['shortName', 'cutoutThumbnail']` without Keepa market data.
`getMany`, search, and history do not generate cutouts.

`get` answers enrichment in one call. With `shortName` or `cutoutThumbnail` included, it waits for
that generation, up to a 20-second enrichment budget that starts once the listing is resolved and
includes time queued behind the server's generation concurrency limits. A field still generating
at the deadline, or whose generation failed within the last five minutes, returns as none for this
response (`shortName: null`, `cutoutThumbnail: { status: 'unavailable' }`); generation keeps
running, so a later `get` returns the finished value. Slow or failed enrichment never produces a
`TIMEOUT` or asks the caller to retry. Concurrent requests for the same Product share one
generation.

## Basic Products

`product.getMany` accepts one to 200 unique `{ marketplaceId, asin }` pairs and no `include`;
request short names or cutouts with `get`. ASINs are normalized
to uppercase. Results preserve request order and always contain the same keys:

```ts
type BasicProduct = {
    marketplaceId: string;
    asin: string;
    title: string | null;
    thumbnail:
        | { status: 'available'; url: string }
        | { status: 'unavailable' };
    amazonListingStatus: 'active' | 'deleted';
};
```

`amazonListingStatus: 'active'` means the Amazon detail-page listing exists for that
marketplace/ASIN. It does not promise an in-stock or buyable offer. `deleted` means Amazon has
effectively removed the listing and customers can no longer reach a purchasable detail page.
RankWrangler confirms deletion when a successful Amazon Catalog lookup does not return the ASIN;
pending work and provider failures do not produce it. RankWrangler preserves last-known title and
thumbnail data and returns it immediately while a background refresh runs; `getMany` waits only for
Products with no resolved listing. A Product never returned by Amazon has `title: null` and an
unavailable thumbnail.
`thumbnail.status: 'unavailable'` only means there is no usable image and does not make the Amazon
listing deleted.

Cached listing data returns immediately. Cold identities are grouped by marketplace and fetched
from SP-API in batches of 20. Every requested identity is persisted in the canonical catalog,
including identities Amazon does not return. Each pair consumes one Service Account usage unit.
Keepa history is not part of the synchronous response; newly classified eligible Products enter
the existing asynchronous history-refresh policy.

## Product search

`product.search` is a database query. It returns `{ items, nextCursor, coverage }` immediately
without provider retrieval, Product enrichment, or history collection. An empty result is a valid
answer and does not establish that Amazon has no matching Products.

| Input | Meaning and default |
| --- | --- |
| `term` | Optional text. Omit to browse. Maximum 200 characters. |
| `textFields` | `all` by default, or `title`. Text uses case-insensitive word AND matching with PostgreSQL's `simple` dictionary, without stemming or semantic expansion. Exact ASINs also match. With `all`, retained membership in an observation of the normalized keyword also matches. |
| `excludeWords` | Up to 20 excluded text expressions, tested against the selected text fields. |
| `marketplaceIds` | US by default. An empty array includes all stored marketplaces. |
| `isMerchListing` | `true` by default, or `false`, `unknown`, or `all`. |
| `amazonListingStatus` | `active` by default, or `deleted` or `all`. |
| `brands`, `excludeBrands` | Exact brand names after case and whitespace normalization. |
| `includeOfficialBrands` | `false` excludes exact matches in the maintained marketplace-specific registry. The initial registry has no verified entries. Unknown brands remain visible. |
| `categoryIds` | Root-category IDs. |
| `salesRank`, `price`, `monthlySold` | Inclusive integer `{ min?, max? }` ranges. Price uses minor currency units, with no currency conversion across marketplaces. |
| `firstAvailableAt`, `discoveredAt`, `updatedAt` | Inclusive `{ after?, before? }` ranges using ISO dates or datetimes. A date means midnight, not the end of that day. |
| `facets` | Matching `{ facet, name }` assignments. Any supplied assignment can match. |
| `sort` | `relevance` by default. Also `salesRankAsc`, `salesRankDesc`, `firstAvailableAtAsc`, `firstAvailableAtDesc`, `updatedAtAsc`, `updatedAtDesc`, `discoveredAtDesc`, `priceAsc`, `priceDesc`, or `monthlySoldDesc`. Without text, relevance falls back to newest discovered. |
| `limit`, `cursor` | 1–100 items, default 50. Opaque keyset cursor scoped to the filters and sort. |

All filters combine with AND. Unknown numeric values fail bounded numeric filters. All sort orders
put nulls last and use Product identity as a tie breaker. Invalid or mismatched cursors produce
`BAD_REQUEST`. Pagination reads live data, so changing Products can move between pages.

Each item contains identity, title, brand, bullets, resolved thumbnail availability, classification,
listing status, root category ID, current `salesRank`, price, first-available, discovered, and updated
timestamps, facets, rank `averages`, and `demand` with monthly evidence and drop windows. Null
measurements remain unknown. The current canonical root BSR drives the filter, ordering, and
returned `salesRank`; an older Keepa current-BSR copy does not override it.

On a first page with text and a scope that includes the US, `coverage` contains `{ keyword,
headCheckedAt, exploration }`. The head timestamp is the latest retained successful Keepa keyword
observation or null. Exploration is null or `{ source: 'spapi', pages, observedAt, budgetLimited }`:
contiguous observed pages, oldest page time and whether the pass stopped for budget. It does not
claim Amazon organic ordering or exhaustive results. Other reads return `coverage: null`.

The read records normalized keyword interest without renewing an explicit research lease. Background
admission, checks and exploration run independently. An empty result can reflect an early coverage
gap; the request does not wait for discovery. Source timestamps remain separate from Product counts.

## Keyword results

`keyword.results` preserves the former external Product-search behavior. It accepts `{ term,
refresh? }`, reuses a successful run for 24 hours, and waits for collection and Product enrichment
when a new run is needed. `refresh: true` requests a replacement run. Equivalent requests share
work. Provider failure and deadline errors retain the existing retryable error contract.

```ts
type KeywordResults = {
    keyword: string;
    searchedAt: string;
    results: Array<{
        organicSearchPlacement: number;
        product: {
            marketplaceId: string;
            asin: string;
            title: string | null;
            brand: string | null;
            thumbnail:
                | { status: 'available'; url: string }
                | { status: 'unavailable' };
            isMerchListing: boolean | null;
            amazonListingStatus: 'active' | 'deleted';
            category: { id: number; name: string | null } | null;
            salesRank: number | null;
            price: { amountMinor: number; currencyCode: string } | null;
            boughtInPastMonth: number | null;
        };
    }>;
};
```

Results contain up to 20 Products from a US first-page observation. `organicSearchPlacement` is the
source-supplied ordinal. Invalid or duplicate rows leave gaps. Membership and placement remain
immutable, while the nested compact Product projection reflects current state. Placement is useful
source evidence rather than a guaranteed Amazon organic rank. This capability is separate from
stored keyword directory entries.

## Product History

`product.history` accepts Product identity plus optional `metrics`, `bucket`, `days`, `startAt`,
`endAt`, and `limit`. `metrics` contains `salesRank`, `price`, or both; `bucket` is `auto`, `day`,
`week`, or `month`.

```ts
type SeriesSummary = {
    first: number | null;
    latest: number | null;
    min: number | null;
    max: number | null;
};

type ProductHistory = {
    marketplaceId: string;
    asin: string;
    range: {
        startAt: string;
        endAt: string;
        interval: 'day' | 'week' | 'month';
    };
    series: {
        salesRank?: {
            unit: 'rank';
            category: { id: number; name: string | null } | null;
            points: Array<[periodStart: string, valueAtPeriodEnd: number | null]>;
            summary: SeriesSummary;
        };
        price?: {
            unit: 'minorCurrency';
            currencyCode: string;
            points: Array<[periodStart: string, valueAtPeriodEnd: number | null]>;
            summary: SeriesSummary;
        };
    };
};
```

Requested metrics own their series; unrequested series are absent. Current valid empty history
succeeds with `points: []` and a summary whose four values are `null`. Summary values deliberately
omit count and point dates already represented by the series.

## Keyword directory

`keyword.get({ keyword })` reads one normalized US keyword and returns `{ keyword, data }`;
`data` is null when absent, and any stage is returned.
`keyword.search({ text, stage?, freshness?, heat?, sort?, limit?, cursor? })` returns `items` and
`nextCursor`. Pass the returned cursor object unchanged. Stage filters are graduated (default),
trial, dropped, untracked and all. Freshness filters are all (default), live, needsSync and
syncing. Heat filters are all, hot, warm, cold and unrated. Sort defaults to work priority:
graduated keywords syncing, then due, then live; trials by Brand Analytics rank; then dropped and
untracked. Newest is also available. Workers run independently, so work order is a priority view
rather than a fixed FIFO rank. Pass nextCursor unchanged to retain the full ordering snapshot. Both
procedures read stored data without provider calls.
Entries include sources, stage, freshness, retryScheduled, known Merch/product counts, score,
searchFrequencyRank (the latest weekly Amazon Brand Analytics rank, or null when Amazon does not
rank the term), last check, interval and next check. Stage is trial (awaiting its first-page
qualification check), graduated (tracked), dropped (failed the check) or untracked (not
scheduled). Freshness is live (first page current), needsSync (check due or never observed) or
syncing (a check is running); trials are only needsSync or syncing, and dropped or untracked
entries have null freshness, interval and next check. Stage, freshness and score describe our
collection progress and priority, not organic search volume.
Weekly Brand Analytics history is not exposed. `keyword.results` still provides dated Amazon product-search evidence.

## Raw Request

tRPC mutations use an `input` envelope:

```bash
curl -s -X POST \
  https://rankwrangler-api.merchbase.co/api/api.public.product.get \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <opaque-oauth-access-token>' \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

Use generated router types for exact procedure inputs and outputs.
