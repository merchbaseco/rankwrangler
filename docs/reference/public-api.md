---
summary: Defines the shipped public tRPC transport, authentication, Product and keyword agent procedures, freshness, and errors.
read_when:
  - calling RankWrangler without the CLI or typed npm client
  - changing public authentication, Product inputs, retrieval output, or API transport
---

# Public API

RankWrangler's external API is tRPC over HTTP. It is not a separate REST surface. Prefer the
[typed HTTP client](http-client.md) or [CLI](cli.md); use raw HTTP when integrating another
runtime. The hosted agent-tool contract is documented in [Hosted MCP](mcp.md).

## Endpoint and authentication

The tRPC endpoint is `{origin}/api/{procedure}`. Production origin:
`https://rankwrangler.merchbase.co`.

Public integration calls live under `api.public.*` and require a Merchbase API key or OAuth bearer.
The browser extension may use a transient Clerk session token for the same data procedures:

```http
Authorization: Bearer ak_... | oat_...
Content-Type: application/json
```

Invalid or absent credentials produce `UNAUTHORIZED`; denied centralized access produces `FORBIDDEN`;
unavailable centralized access produces `SERVICE_UNAVAILABLE`; exhausted service-account allowance
produces `TOO_MANY_REQUESTS` with a `Retry after N seconds` hint. Missing Products produce
`NOT_FOUND`. Temporary retrieval capacity or deadline failures produce `TIMEOUT` with a
provider-neutral message and `Retry after N seconds`.
Dashboard `api.app.*` procedures are separate Clerk-authenticated application contracts.

## Public agent procedures

The data surface is deliberately small:

| Procedure | Transport | Purpose |
| --- | --- | --- |
| `api.public.product.get` | mutation | Product summary plus bucketed BSR/price history. |
| `api.public.product.search` | mutation | Synchronous caller-transparent Product search. |
| `api.public.product.history` | mutation | Product history in `agent` or `legacy` format. |
| `api.public.keyword.get` | query | Current Brand Analytics keyword evidence. |
| `api.public.keyword.search` | query | Filtered keyword evidence. |
| `api.public.keyword.history` | query | Keyword evidence over time. |

There is no public Catalog namespace, Operation namespace, polling procedure, provider status, or
provider-specific frontend availability state. Durable work remains an internal implementation
detail.

## Raw request

tRPC mutations use an `input` envelope:

```bash
curl -s -X POST \
  https://rankwrangler.merchbase.co/api/api.public.product.get \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $MERCHBASE_API_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","refresh":true,"metrics":["bsr","price"],"bucket":"auto","days":365}}'
```

Use the generated router types for exact procedure inputs and outputs. The canonical router is
[`router-public.ts`](../../apps/server/src/api/router-public.ts); Product inputs are defined in
[`product-input.ts`](../../apps/server/src/api/public/product-input.ts).

## Product inputs and freshness

Product reads share marketplace and ASIN identity:

| Field | Contract |
| --- | --- |
| `marketplaceId` | Required non-empty Amazon marketplace id. The CLI defaults to US. |
| `asin` | Required 10-character alphanumeric ASIN; normalized to uppercase. |
| `metrics` | Optional one or two values: `bsr`, `price`. |
| `bucket` | `auto`, `day`, `week`, or `month`; default `auto`. |
| `days` | 30–3650; default 365. |
| `startAt`, `endAt` | Optional date-coercible range bounds. |
| `limit` | Source-point cap from 1–10,000; default 5,000. |
| `refresh` | Requests fresh summary/history data where policy allows; default `false`. |

Product summary and history data each expose `{ stale, updatedAt }` where relevant. Available stale
data may return while server-owned revalidation continues. Missing data and `refresh: true` wait for
the shared retrieval policy. Equivalent requests join one retrieval.

`product.get` returns `schemaVersion`, identity, `status: ready | partial`, `summary`, and an
embedded agent history response. A usable summary is retained when history is unavailable; the
embedded history error includes its own stale freshness envelope and retryable error code/message.

## Product search

`api.public.product.search` accepts `{ term, refresh }`. It returns a completed source-ordered Search
run and one freshness envelope:

```json
{
  "status": "ready",
  "run": {},
  "freshness": { "stale": false, "updatedAt": "2026-08-06T12:00:00.000Z" }
}
```

The server waits inside its bounded retrieval policy and coalesces equivalent requests. The response
contains Search-run data, never an Operation id. A temporary capacity/deadline failure is a
retryable `TIMEOUT` with a retry hint.

## Product history

`api.public.product.history` accepts the shared Product fields plus `format: agent | legacy`.
`agent` returns schema-v2 bucketed BSR/price series; `legacy` returns main-category BSR points. Both
formats include a category-level freshness envelope and no Operation, polling, or provider status.

## Keyword intelligence

The keyword family is read-only: `get`, `search`, and `history`. Inputs accept `refresh: true` plus
the keyword/text, US marketplace and report-period defaults, and optional date/range filters.
Responses expose available evidence or history points and one top-level freshness envelope. Missing
data and explicit refreshes use the same synchronous caller-transparent retrieval policy.

## Contract source

- [`router-public.ts`](../../apps/server/src/api/router-public.ts) — publishable router type.
- [`product-read-model.ts`](../../apps/server/src/services/product-read-model.ts) — rich Product response.
- [`product-history-agent.ts`](../../apps/server/src/services/product-history-agent.ts) — agent history shape.
- [`ProductInfo`](../../apps/server/src/types/index.ts) — summary fields and units.
