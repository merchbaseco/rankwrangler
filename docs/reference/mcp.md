---
summary: Defines the hosted RankWrangler MCP endpoint, OAuth boundary, tools, inputs, and errors.
read_when:
  - connecting an agent to hosted RankWrangler MCP
  - changing MCP authentication, tool names, discriminators, or public error mapping
---

# Hosted MCP

The hosted Model Context Protocol endpoint is `https://rankwrangler.merchbase.co/mcp`. It exposes
three tools and requires an OAuth bearer token authorized through the RankWrangler Clerk access
boundary. The supported OAuth scopes are `openid`, `email`, and `profile`.

Caddy forwards `/mcp` and these exact OAuth discovery paths to Fastify: the protected-resource
metadata paths with and without `/mcp`, and the authorization-server metadata paths with and
without `/mcp`. Other website paths are not MCP routes.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `rankwrangler_status` | `{}` | RankWrangler readiness and the six noun/verb capabilities. |
| `rankwrangler_product` | `operation: get \| search \| history` | Final Product data or a standard error. |
| `rankwrangler_keyword` | `operation: get \| search \| history` | Final keyword data or a standard error. |

`rankwrangler_product` uses `asin` for `get` and `history`, and `term` for `search`. It accepts
the public Product history fields and `refresh`. `rankwrangler_keyword` uses `keyword` for `get`
and `history`, `text` for `search`, and accepts cursor/limit or range options plus `refresh`.
The keyword marketplace is the US marketplace (`ATVPDKIKX0DER`).

Every data tool call completes synchronously from the caller's perspective. It returns final data,
including the operation/data freshness envelope where the underlying procedure provides one, or a
structured error. MCP does not expose Catalog, Operation, polling, provider status, or
provider-named frontend availability tools. Product data carries only nullable
`isMerchListing`; `null` remains unknown rather than being serialized as `false`.

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
