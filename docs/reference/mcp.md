---
summary: Defines the hosted RankWrangler MCP endpoint, OAuth boundary, tools, inputs, and errors.
read_when:
  - connecting an agent to hosted RankWrangler MCP
  - changing MCP authentication, tool names, discriminators, or public error mapping
---

# Hosted MCP

**Status:** Endpoint, OAuth, and tool families are shipped. Retrieval inputs and outputs below are
the accepted public target.

The hosted Model Context Protocol endpoint is `https://rankwrangler.merchbase.co/mcp`. It exposes
three tools and requires an OAuth bearer token authorized through the RankWrangler Clerk access
boundary. The supported OAuth scopes are `openid`, `email`, and `profile`.

Caddy forwards `/mcp` and these exact OAuth discovery paths to Fastify: the protected-resource
metadata paths with and without `/mcp`, and the authorization-server metadata paths with and
without `/mcp`. Other website paths are not MCP routes.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `rankwrangler_status` | `{}` | Connection, authentication, and seven supported noun/verb capabilities. |
| `rankwrangler_product` | `operation: get \| getMany \| search \| history` | Product data or a standard error. |
| `rankwrangler_keyword` | `operation: get \| search \| history` | Keyword data or a standard error. |

`rankwrangler_product` uses `asin` and `marketplaceId` for `get`; `getMany` accepts `products` with
1–200 unique `{ asin, marketplaceId }` pairs and returns the basic Product array. It adds only the
documented Product-history range, metric, and bucket fields for `history`, and uses `term` for
`search`.
`rankwrangler_keyword` uses `keyword` for `get` and `history`, `text` for `search`, and accepts
cursor/limit or range options. Product `get`/`getMany`/`history` and keyword inputs do not accept
`refresh`. The separate Product Search contract retains its existing search input.
The keyword marketplace is the US marketplace (`ATVPDKIKX0DER`).

Product `search` returns `keyword`, `searchedAt`, and compact `results`. Each result nests
`organicSearchPlacement` and a compact Product projection with identity, title, brand, resolved
thumbnail, classification, category, current sales rank, price, and bought-in-the-past-month
evidence. It is not a full Product response.

Product `history` returns `range.interval`. Every requested series has an always-present summary;
valid empty series return `points: []` and `null` for `first`, `latest`, `min`, and `max`. Price
history exposes minor-currency unit and currency code without a scale field.

Every data tool call completes synchronously from the caller's perspective. It returns
policy-current data or a structured error. MCP does not expose stale/pending Product data,
freshness, Catalog, Operation, polling, provider status or timestamps, or provider-named frontend
availability tools. Product `get`/`getMany`/`history` and keyword operations have no refresh input;
Product Search retains its separate Search input. Product data carries only nullable
`isMerchListing`; `null` remains unknown rather than being serialized as `false`.

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
