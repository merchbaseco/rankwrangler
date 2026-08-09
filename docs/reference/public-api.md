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

Product `get`/`getMany`/`history` and keyword inputs have no refresh control. Product Search retains
its separate search input. Product `get`/`getMany`/`history` and keyword responses expose no stale
or pending data, freshness, Operations, polling state, provider status or response `schemaVersion`.

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

`product.get` accepts only `marketplaceId` and a ten-character alphanumeric `asin`, normalized to
uppercase. It returns one Product rather than a summary/history composite:

```ts
type Product = {
    marketplaceId: string;
    asin: string;
    listing: {
        title: string | null;
        brand: string | null;
        firstAvailableAt: string | null;
        bulletPoints: string[];
        thumbnail:
            | { status: 'available'; url: string }
            | { status: 'unavailable' };
        isMerchListing: boolean | null;
        isUnavailable: boolean;
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
    isUnavailable: boolean;
};
```

`isUnavailable: true` means Amazon has no customer-purchasable listing for that marketplace/ASIN.
For application purposes, the Product is deleted and unavailable to purchase. RankWrangler confirms
this state when a successful Amazon Catalog lookup does not return the ASIN; pending work and
provider failures do not set it. RankWrangler preserves last-known title and thumbnail data when
available. A Product never returned by Amazon has `title: null` and an unavailable thumbnail.
`thumbnail.status: 'unavailable'` only means there is no usable image and does not make the Product
itself unavailable.

Cached listing data returns immediately. Cold identities are grouped by marketplace and fetched
from SP-API in batches of 20. Every requested identity is persisted in the canonical catalog,
including identities Amazon does not return. Each pair consumes one Service Account usage unit.
Keepa history is not part of the synchronous response; newly classified eligible Products enter
the existing asynchronous history-refresh policy.

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
            isUnavailable: boolean;
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
