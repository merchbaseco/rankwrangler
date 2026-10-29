---
summary: Defines the hosted RankWrangler MCP endpoint, OAuth boundary, tools, inputs, and errors.
read_when:
  - connecting an agent to hosted RankWrangler MCP
  - changing MCP authentication, tool names, discriminators, or public error mapping
---

# Hosted MCP

**Status:** Endpoint, OAuth, and tool families are shipped. Retrieval inputs and outputs below are
the accepted public target.

The hosted Model Context Protocol endpoint is `https://rankwrangler-api.merchbase.co/mcp`. It exposes
three tools and requires an OAuth bearer token authorized through the suite Cloudflare API
boundary. Clients discover Managed OAuth without requesting Clerk identity scopes.

Caddy forwards `/mcp` and these exact OAuth discovery paths to Fastify: the protected-resource
metadata paths with and without `/mcp`, and the authorization-server metadata paths with and
without `/mcp`. Other website paths are not MCP routes.

The `initialize` server info advertises `websiteUrl` `https://rankwrangler.merchbase.co` and a
128px PNG icon at `https://rankwrangler.merchbase.co/icon.png`. The website serves that icon and
`/favicon.ico` from `apps/website/public/`, so clients can resolve either without authentication.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `rankwrangler_status` | `{}` | Connection, authentication, and eight supported noun/verb capabilities. |
| `rankwrangler_product` | `operation: get \| getMany \| search \| history` | Product data or a standard error. |
| `rankwrangler_keyword` | `operation: get \| search \| history \| results` | Keyword data or a standard error. |

`rankwrangler_product` uses `asin` and `marketplaceId` for `get`. It may also set
`include: ['shortName', 'cutoutThumbnail']` to request an image-informed label and a transparent
Product cutout in the full Product response. `get` waits up to 20 seconds for that generation and
then returns any unfinished field as none (`shortName: null`, `cutoutThumbnail:
{ status: 'unavailable' }`) while generation continues; it never returns
`TEMPORARILY_UNAVAILABLE` just because enrichment is slow or failed. The default is `['marketData']`. `getMany` accepts `products` with 1–200 unique
`{ asin, marketplaceId }` pairs and returns a fixed-shape basic Product array without short names
or cutouts; it rejects `include`.
Every basic result includes identity, nullable title, resolved thumbnail, and
`amazonListingStatus: active | deleted`. Active means the Amazon detail-page listing exists; it does
not promise that an offer is in stock or buyable. Deleted means Amazon has effectively removed the
listing from that marketplace. RankWrangler confirms deletion when a successful Amazon Catalog
lookup does not return the ASIN; pending work and provider failures do not produce it. Retained
title and thumbnail values are last-known listing data. `get` and `getMany` return a known
Product's last-known listing immediately and refresh it in the background; they wait only for
Products with no resolved listing. An unavailable thumbnail alone means no
usable image, not a deleted listing. The tool adds only the documented Product-history range, metric,
and bucket fields for `history`. Product `search` accepts an optional `term` and catalog filters.
`rankwrangler_keyword` uses `keyword` for `get` and `history`, `text` for `search`, and accepts
cursor/limit or range options. Keyword `results` uses `term` and optional `refresh` (default false).
Product operations and keyword `get`, `search`, and `history` do not accept `refresh`.
The keyword marketplace is the US marketplace (`ATVPDKIKX0DER`).

Product `search` immediately reads the collected catalog and returns `items`, `nextCursor`, and
`coverage`. It never waits for collection. Empty results do not prove a niche is empty.
Search accepts these filters:

- `term`, `textFields: all | title`, and `excludeWords`.
- `marketplaceIds` (defaults to US; an empty array selects all marketplaces).
- `isMerchListing: true | false | unknown | all` (defaults to true).
- `amazonListingStatus: active | deleted | all` (defaults to active).
- `brands`, `excludeBrands`, `includeOfficialBrands` (defaults to false), and `categoryIds`.
- `salesRank`, `price`, and `monthlySold` with optional integer `min` and `max`. Prices use minor
  currency units. Unknown values do not match numeric bounds.
- `firstAvailableAt`, `discoveredAt`, and `updatedAt` with optional ISO `after` and `before` dates.
- `facets`, an array of `{ facet, name }` selections.

`sort` accepts `relevance` (default), `salesRankAsc`, `salesRankDesc`, `firstAvailableAtAsc`,
`firstAvailableAtDesc`, `updatedAtAsc`, `updatedAtDesc`, `discoveredAtDesc`, `priceAsc`, `priceDesc`,
and `monthlySoldDesc`. `limit` is 1–100 (default 50); pass `nextCursor` as `cursor` for the next
page with the same filters and sort. Pages reflect current data and can move as listings change.
Search items include compact screening metrics. Coverage reports dated keyword observations; it
does not promise a complete catalog.

Keyword `results` returns `keyword`, `searchedAt`, and compact `results`. It reuses search evidence
for 24 hours unless `refresh` is true, and can wait for collection. Each result nests
`organicSearchPlacement` and a compact Product projection with identity, title, brand, resolved
thumbnail, classification, category, current sales rank, price, and bought-in-the-past-month
evidence. It is not a full Product response.

Product `history` returns `range.interval`. Every requested series has an always-present summary;
valid empty series return `points: []` and `null` for `first`, `latest`, `min`, and `max`. Price
history exposes minor-currency unit and currency code without a scale field.

Every data tool call completes synchronously from the caller's perspective. It returns
policy-current data, last-known Product listing data, or a structured error. MCP does not expose pending Product data,
provider freshness, Catalog, Operation, polling, provider status, or provider-named frontend
availability tools. Product search coverage and keyword results expose dated research evidence.
Only keyword `results` accepts `refresh`. Nullable `isMerchListing` remains unknown rather
than being serialized as `false`; Product listing availability is exposed separately as
`amazonListingStatus`.

`rankwrangler_status` does not report data or provider health, freshness, timestamps, or work state.

## Errors

MCP errors use a stable neutral shape:

```json
{
  "error": {
    "code": "TEMPORARILY_UNAVAILABLE",
    "message": "Requested data is temporarily unavailable. Retry after 60 seconds.",
    "retryable": true,
    "retryAfterSeconds": 60
  }
}
```

`NOT_FOUND` is non-retryable. Temporary retrieval timeouts and service unavailability map to
`TEMPORARILY_UNAVAILABLE` with `retryable: true` and a retry hint. Invalid input, authentication,
authorization, allowance exhaustion, and unexpected failures map to `INVALID_INPUT`,
`UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, or `INTERNAL_ERROR` respectively. `RATE_LIMITED` is
retryable and includes the seconds until the daily allowance resets.

OAuth discovery is available at the standard protected-resource and authorization-server
well-known routes. An unauthenticated MCP request receives a bearer challenge pointing to the
protected-resource metadata for `/mcp`.
