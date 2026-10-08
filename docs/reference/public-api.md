---
summary: Defines public tRPC authentication, caller-synchronous retrieval, and provider-neutral response shapes.
read_when:
  - calling RankWrangler without the CLI or typed npm client
  - changing public authentication, Product inputs, retrieval output, or API transport
---

# Public API

**Status:** Authentication and transport are shipped. The retrieval behavior and data shapes below
are the accepted public target.

RankWrangler's external API is tRPC over HTTP, not REST. Prefer the
[typed HTTP client](http-client.md) or [CLI](cli.md); use raw HTTP when integrating another runtime.
The hosted agent-tool contract is documented in [Hosted MCP](mcp.md).

## Endpoint And Authentication

The tRPC endpoint is `{origin}/api/{procedure}`. Production origin:
`https://rankwrangler.merchbase.co`.

Public integration calls live under `api.public.*` and require a Merchbase API key or OAuth bearer.
The browser extension may use a transient Clerk session token for the same data procedures:

```http
Authorization: Bearer ak_... | oat_...
Content-Type: application/json
```

Invalid or absent credentials produce `UNAUTHORIZED`; denied centralized access produces
`FORBIDDEN`; unavailable centralized access produces `SERVICE_UNAVAILABLE`; exhausted allowance
produces `TOO_MANY_REQUESTS` with a retry hint. Missing Products produce `NOT_FOUND`. Retryable
provider failure or request deadline exhaustion produces `TIMEOUT` with a provider-neutral message
and retry hint. Dashboard `api.app.*` procedures are separate Clerk-authenticated contracts.

## Retrieval Contract

Every public operation returns final policy-current data or an error. Each capability owns its
server freshness policy. A current cache hit returns immediately; missing or policy-expired data
starts or joins durable work and waits. Caller deadline exhaustion does not cancel that work, and a
retry coalesces with it.

Product `get` and `getMany` serve last-known listing data for any Product with a resolved listing:
a policy-expired read returns the stored title, thumbnail, and `amazonListingStatus` immediately and
queues a deduplicated background refresh. Only Products with no resolved listing wait, bounded by
the caller deadline. See [Public Retrieval](../decisions/public-retrieval.md).

Product `get`/`getMany`/`history` and keyword inputs have no refresh control. Product Search retains
its separate search input. Product `get`/`getMany`/`history` and keyword responses expose no
pending data, freshness, Operations, polling state, provider status or response `schemaVersion`,
with one exception: `getMany` enrichment requested through `include` reports a per-item `pending`
list (see [Batch enrichment](#batch-enrichment)).

## Procedures

| Procedure | Transport | Result |
| --- | --- | --- |
| `api.public.product.get` | mutation | One current Product. |
| `api.public.product.getMany` | mutation | Basic listing results for up to 200 Product identities. |
| `api.public.product.search` | mutation | Keyword, search time, and compact Product results with placement. |
| `api.public.product.history` | mutation | Product sales-rank and price series. |
| `api.public.keyword.get` | query | Current Brand Analytics keyword evidence. |
| `api.public.keyword.search` | query | Current filtered keyword evidence. |
| `api.public.keyword.history` | query | Current keyword evidence over time. |

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
response for detail views; search and history do not perform this image analysis, and `getMany`
returns it only through [Batch enrichment](#batch-enrichment). A requested short name is
stored per Product and reused while its title, image URL, and generator version are unchanged.

`cutoutThumbnail` independently requests a transparent 128×128 WebP of the Product photo. The visible
subject is cropped to its alpha bounds, scaled to fit, and centered. It is `null` when omitted,
available with a CDN URL when generated, and unavailable when the source image cannot be processed
or generation fails. The original `thumbnail` remains the listing photo. A requested cutout is
stored in R2 and reused while the source URL and generator version are unchanged;
generation failures do not prevent the Product or a requested short name from returning. A caller
displaying chips can request `include: ['shortName', 'cutoutThumbnail']` without Keepa market data.
Search and history do not generate cutouts; `getMany` uses [Batch enrichment](#batch-enrichment).

## Basic Products

`product.getMany` accepts one to 200 unique `{ marketplaceId, asin }` pairs. ASINs are normalized
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

## Batch Enrichment

`product.getMany` accepts an optional `include: Array<'shortName' | 'cutoutThumbnail'>` so a chip
renderer can load a batch in one call. `marketData` is `get`-only and fails validation with
`BAD_REQUEST`. Without `include`, results are exactly the basic shape above. With it, each item
appends the requested fields, in the same shape and from the same stored values `get` returns in
`listing.shortName` and `listing.cutoutThumbnail`, plus `pending`:

```ts
type BatchProduct = BasicProduct & {
    shortName?: string | null; // present when requested
    cutoutThumbnail?: // present when requested
        | { status: 'available'; url: string }
        | { status: 'unavailable' }
        | { status: 'pending' };
    pending: Array<'shortName' | 'cutoutThumbnail'>; // present when include is passed
};
```

`getMany` never waits on generation and never fails a batch over one item's enrichment. Stored
short names and cutouts are read for the whole batch in one query each. A requested field listed
in `pending` is still being generated: `shortName` is `null` and `cutoutThumbnail` is
`{ status: 'pending' }`. Generation for it has started in the background, deduplicated with any
other request for the same input, so request those items again shortly. A requested field not in
`pending` is settled: `shortName: null` means there is no name (not a Merch listing, no image,
deleted listing, abstention, or a generation failure in the last five minutes), and
`{ status: 'unavailable' }` means there is no cutout. Settled failures are retried by a later
request after five minutes.

```json
[
    {
        "marketplaceId": "ATVPDKIKX0DER",
        "asin": "B0DV53VS61",
        "title": "Zombiecorn Unicorn Halloween Shirt",
        "thumbnail": { "status": "available", "url": "https://m.media-amazon.com/images/I/a.jpg" },
        "amazonListingStatus": "active",
        "shortName": "Zombiecorn",
        "cutoutThumbnail": {
            "status": "available",
            "url": "https://images.rankwrangler.merchbase.co/cutouts/ATVPDKIKX0DER/B0DV53VS61/f.webp"
        },
        "pending": []
    },
    {
        "marketplaceId": "ATVPDKIKX0DER",
        "asin": "B0CXYZ1234",
        "title": "Garden Gnome Lover Funny Shirt",
        "thumbnail": { "status": "available", "url": "https://m.media-amazon.com/images/I/b.jpg" },
        "amazonListingStatus": "active",
        "shortName": null,
        "cutoutThumbnail": { "status": "pending" },
        "pending": ["shortName", "cutoutThumbnail"]
    },
    {
        "marketplaceId": "ATVPDKIKX0DER",
        "asin": "B0RETIRED1",
        "title": "Retired Shirt",
        "thumbnail": { "status": "unavailable" },
        "amazonListingStatus": "deleted",
        "shortName": null,
        "cutoutThumbnail": { "status": "unavailable" },
        "pending": []
    }
]
```

## Product Search

`product.search` accepts `{ term, refresh? }` and returns the compact contract below. `refresh`
requests a replacement Search run under the server-owned Search policy; it does not expose Product
freshness or provider state.

```ts
type ProductSearch = {
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

Every result is a compact current Search projection with resolved thumbnail availability. It omits
bullets, rank averages and drop windows, full demand, history, provider metadata, and freshness.
`organicSearchPlacement` is the source-supplied Product ordinal for this Search run. Invalid or
duplicate results leave ordinal gaps. It is useful source evidence, not a guaranteed Amazon organic
rank. Membership and placement are immutable Search-run evidence; the projected Product fields
remain independent current state.

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

## Keyword Intelligence

The keyword family is read-only: `get`, `search`, and `history`. Inputs accept keyword/text, US
marketplace and report-period defaults, and optional date, range, cursor, and limit fields. They do
not accept refresh. Stored snapshots retain `requested` or `automatic` collection provenance where
the keyword contract exposes history.

## Raw Request

tRPC mutations use an `input` envelope:

```bash
curl -s -X POST \
  https://rankwrangler.merchbase.co/api/api.public.product.get \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $MERCHBASE_API_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61"}}'
```

Use generated router types for exact procedure inputs and outputs.
