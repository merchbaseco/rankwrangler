---
summary: Defines the hosted RankWrangler MCP endpoint, OAuth boundary, tools, inputs, and errors.
read_when:
  - connecting an agent to hosted RankWrangler MCP
  - changing MCP authentication, tool names, discriminators, or public error mapping
---

# Hosted MCP

The hosted Model Context Protocol endpoint is `https://rankwrangler.merchbase.co/mcp`; the API host
remains an alias at `https://rankwrangler-api.merchbase.co/mcp`. Both hosts expose three tools and
require a person OAuth bearer token authorized through the suite Cloudflare API boundary.
Protected-resource metadata and OAuth challenges name the exact admitted host receiving the
request.

Caddy forwards `/mcp` and the two exact protected-resource metadata paths to Fastify. Cloudflare
Access serves authorization-server metadata at the configured issuer, which the protected-resource
metadata advertises. Other website paths are not MCP routes.

The `initialize` server info advertises `websiteUrl` `https://rankwrangler.merchbase.co` and a
128px PNG icon at `https://rankwrangler.merchbase.co/icon.png`. The website serves that icon and
`/favicon.ico` from `apps/website/public/`, so clients can resolve either without authentication.

## Tools

The server advertises version `0.7.0`.

| Tool | Input | Result |
| --- | --- | --- |
| `rankwrangler_status` | `{}` | Connection, authentication, and capabilities: product `get`, `getMany`, `search`, `history`; keyword `get`, `list`. |
| `rankwrangler_product` | `operation: get \| getMany \| search \| history` | Product data or a standard error. |
| `rankwrangler_keyword` | `operation: get \| list` | Keyword data or a standard error. |

Each tool forwards to the matching [public procedure](public-api.md#procedures), which owns field
meanings and response shapes. MCP-specific rules:

| Operation | Fields |
| --- | --- |
| product `get` | `asin`, `marketplaceId`, optional `include` (`marketData`, `shortName`, `cutoutThumbnail`; default `['marketData']`). |
| product `getMany` | `asins` (1–200 unique ASINs) and optional `marketplaceId` (default US). Rejects `include`. |
| product `search` | Every [Product search](public-api.md#product-search) input, including singular `marketplaceId`, plus optional `contactSheet`. |
| product `history` | `asin`, `marketplaceId`, and the range options `startAt`, `endAt`, `days`, `bucket`, `metrics`, `limit`. |
| keyword `get` | `keyword`. |
| keyword `list` | `term`, optional `stage`, `freshness`, `heat`, `sort`, `limit` (default 25), and `cursor`. |

Product `get` waits up to 20 seconds for requested `shortName` or `cutoutThumbnail` generation and
then returns any unfinished field as none (`shortName: null`, `cutoutThumbnail:
{ status: 'unavailable' }`) while generation continues; it never returns `TEMPORARILY_UNAVAILABLE`
just because enrichment is slow or failed. `include` still accepts the removed `'variations'` token
without error; it resolves to nothing, since owned-listing variant data now comes from
merchbase-core. `get` and `getMany` return a known Product's last-known listing immediately and
refresh it in the background; they wait only for Products with no resolved listing.

Product `search` returns `items`, `nextCursor`, and `coverage`. Text matches titles only, the
default sort is `estimatedMonthlySalesDesc`, and a first page that finds nothing for a term never
collected waits for the [live fallback](#live-fallback). Empty results otherwise do
not prove a niche is empty. Pass `nextCursor` as `cursor` for the next page with the same filters
and sort.

`contactSheet: true` adds one MCP image content block after the JSON text: a base64 JPEG, about
1 MB at most, showing the returned items' images in `items` order. Each cell is labelled with its
1-based index in `items`; a missing or failed image is a grey cell. Only Amazon image hosts are
fetched. The sheet never fails the search; when it cannot be built, the result carries the JSON
alone.

An `INVALID_INPUT` for an unknown field, or a field the operation does not take, names the field
to use where one exists. These are hints only, never accepted aliases:

| Sent | Named replacement |
| --- | --- |
| `marketplaceIds` | `marketplaceId` |
| `products`, or `asin` on `getMany` | `asins` |
| `asins` on `get` | `asin` |
| `text`, `query`, `q`, `search`, or `keyword` on keyword `list` or product `search` | `term` |
| `term` on keyword `get` | `keyword` |
| `monthlySold` | `boughtInPastMonth` |

The keyword marketplace is the US marketplace (`ATVPDKIKX0DER`). For the Products in a niche, call
product `search` with the same term.

Every data tool call completes synchronously from the caller's perspective. It returns
policy-current data, last-known Product listing data, or a structured error. MCP does not expose
pending Product data, provider freshness, Catalog, Operation, polling, provider status, or
provider-named frontend availability tools. No operation accepts `refresh`. `isMerchListing` is
always `true` or `false`; Product listing availability is exposed separately as
`amazonListingStatus`.

`rankwrangler_status` does not report data or provider health, freshness, timestamps, or work state.

### Live fallback

MCP Product `search` collects a never-seen term; public tRPC `product.search` never does, because
the extension calls it on every Amazon search. A first page (no `cursor`) with a `term` in the US
marketplace that finds nothing, for a term with no stored Keepa first-page search of its normalized
form, starts or joins that collection, waits for it, and searches the stored catalog again.
Products the collection surfaces that RankWrangler has never resolved are resolved before the
second search. Equivalent requests share the work, and the collection renews the term's 30-day
research lease. Later pages, searches that found something, and terms already collected answer
from the stored catalog alone.

An exceeded usage limit produces `RATE_LIMITED`. Other billing refusals, missing collection
capacity, provider failure, and deadline exhaustion produce a retryable `TEMPORARILY_UNAVAILABLE`.
The dashboard's Product search has no fallback.

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
