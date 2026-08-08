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

Public inputs have no refresh control. Responses expose no stale or pending data, freshness,
Operations, polling state, provider status or timestamps, or response `schemaVersion`.

## Procedures

| Procedure | Transport | Result |
| --- | --- | --- |
| `api.public.product.get` | mutation | One current Product. |
| `api.public.product.search` | mutation | Current complete Products from one Search run. |
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
        bulletPoints: string[] | null;
        thumbnail:
            | { status: 'available'; url: string }
            | { status: 'unavailable' };
        isMerchListing: boolean | null;
    };
    category: { id: number; name: string | null } | null;
    salesRank: {
        current: number | null;
        average30Days: number | null;
        average90Days: number | null;
    };
    price: { amountMinor: number; currencyCode: string } | null;
    demand: {
        boughtInPastMonth: number | null;
        salesRankDrops: {
            days30: number | null;
            days90: number | null;
            days180: number | null;
            days365: number | null;
        };
    };
};
```

`null` means a valid measurement is unavailable. It never means zero, failure, or pending work.
`isMerchListing` is RankWrangler classification from bullet evidence supplied through either source;
`null` means the Product has not been classified from available evidence. A Sales-rank drop is an
observed numeric BSR improvement, not a confirmed sale.

## Product Search

`product.search` accepts `{ term }` and returns:

```ts
type ProductSearch = {
    searchedAt: string;
    products: Array<Product & { organicSearchPlacement: number }>;
};
```

Every result is a complete current Product projection, including resolved thumbnail availability.
`organicSearchPlacement` is the source-supplied Product ordinal for this Search run. Invalid or
duplicate results leave ordinal gaps. Membership and placement are immutable Search-run evidence;
the Product fields remain independent current state.

## Product History

`product.history` accepts Product identity plus optional `metrics`, `bucket`, `days`, `startAt`,
`endAt`, and `limit`. `metrics` contains `salesRank`, `price`, or both; `bucket` is `auto`, `day`,
`week`, or `month`.

```ts
type SeriesSummary = {
    first: number;
    latest: number;
    min: number;
    max: number;
};

type ProductHistory = {
    marketplaceId: string;
    asin: string;
    range: {
        startAt: string;
        endAt: string;
        period: 'day' | 'week' | 'month';
    };
    series: {
        salesRank?: {
            unit: 'rank';
            category: { id: number; name: string | null } | null;
            points: Array<[periodStart: string, valueAtPeriodEnd: number | null]>;
            summary: SeriesSummary | null;
        };
        price?: {
            unit: 'minorCurrency';
            currencyCode: string;
            valueScale: 100;
            points: Array<[periodStart: string, valueAtPeriodEnd: number | null]>;
            summary: SeriesSummary | null;
        };
    };
};
```

Requested metrics own their series; unrequested series are absent. Current valid empty history
succeeds with empty points and a `null` summary. Summary values deliberately omit count and point
dates already represented by the series.

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
