---
summary: Defines the shipped license-key tRPC transport, authentication, product inputs, history formats, and raw HTTP invocation pattern.
read_when:
  - calling RankWrangler without the CLI or typed npm client
  - changing public authentication, product input validation, history output, or API transport
---

# Public API

RankWrangler's external API is tRPC over HTTP. It is not a separate REST surface. Prefer the
[typed HTTP client](http-client.md) or [CLI](cli.md); use raw HTTP when integrating from another
runtime.

## Endpoint and authentication

The tRPC endpoint is:

```text
{origin}/api/{procedure}
```

Production origin:

```text
https://rankwrangler.merchbase.co
```

Public procedures live under `api.public.*` and require a license key:

```http
Authorization: Bearer rrk_...
Content-Type: application/json
```

An invalid or absent license produces tRPC `UNAUTHORIZED`. An exhausted license allowance
produces `TOO_MANY_REQUESTS`. Clerk-authenticated `api.app.*` procedures are dashboard
application contracts, not part of the public integration surface.

## Raw request

tRPC mutations use an `input` envelope:

```bash
curl -s -X POST \
  https://rankwrangler.merchbase.co/api/api.public.product.get \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $RR_LICENSE_KEY" \
  -d '{"input":{"marketplaceId":"ATVPDKIKX0DER","asin":"B0DV53VS61","metrics":["bsr","price"],"bucket":"auto","days":365}}'
```

Use the generated router types for the complete current procedure tree rather than copying a
procedure inventory into integrations. The canonical router is
[`public/router.ts`](../../apps/server/src/api/public/router.ts); public product inputs are defined
in [`product-input.ts`](../../apps/server/src/api/public/product-input.ts).

## Product inputs

The product read family shares marketplace and ASIN identity:

| Field | Contract |
| --- | --- |
| `marketplaceId` | Required non-empty Amazon marketplace id. US defaulting is a CLI concern. |
| `asin` | Required 10-character alphanumeric ASIN; normalized to uppercase. |
| `metrics` | Optional array of one or two values: `bsr`, `price`. |
| `bucket` | `auto`, `day`, `week`, or `month`; default `auto`. |
| `days` | 30–3650; default 365. |
| `startAt`, `endAt` | Optional date-coercible range bounds. |
| `limit` | Internal source-point cap from 1–10,000; default 5,000. |

Summary reads only require `marketplaceId` and `asin`. They ensure current Product data but do not
import Keepa history.

## Rich product read

The rich product read returns:

```text
schemaVersion: 1
marketplaceId
asin
status: ready | partial
summary: ProductInfo
history: AgentHistoryResponse | history error
```

It ensures a canonical Product exists, then supplies bucketed BSR and price history by default. A
summary can succeed while history fails; that is represented as `status: "partial"`, with the
history error embedded in the response instead of discarding the usable summary.

## History formats

Public history supports two formats:

| Format | Intended consumer | Shape |
| --- | --- | --- |
| `agent` | Agents, CLI, and compact integrations | Schema v2 metric series with buckets and summaries. |
| `legacy` | Existing raw-HTTP consumers | Main-category BSR point rows only. |

`agent` responses contain:

- `status`: `collecting`, `ready`, or `empty`;
- `latestImportAt`, `syncTriggered`, and `operation`;
- the resolved time range and bucket;
- optional `bsr` and `price` series.

`auto` resolves to day buckets through 45 days, week buckets through 18 months, and month buckets
for longer windows. BSR values are ranks. Price values are integer minor currency units with an
explicit currency and scale.

When collection is needed, history returns stored points immediately with a pending Operation:

```text
id
type: productHistoryRefresh
status: pending
retryAfterSeconds: 2
createdAt
updatedAt
```

Poll it with the read-only `api.public.operation.get` query. Polling does not consume another
external-work usage unit. Completed Operations contain exactly one of:

- `resource: { type: "productHistory", marketplaceId, asin }`;
- `error: { code, message }`, with provider details removed.

After resource completion, read Product history again. A range before the earliest available
provider observation can still be empty after successful collection.

## Catalog search

`api.public.catalog.search` is a mutation with `term` and optional `maxAgeSeconds` (default
`86400`, maximum `604800`). It returns either:

- `{ status: "ready", run }` when a successful Search run satisfies the maximum age; or
- `{ status: "pending", operation }` when durable provider work is pending.

Set `maxAgeSeconds: 0` for fresh evidence; an identical pending query still joins one Operation.
The only V1 identity is Keepa, US marketplace, and zero-based page `0`. A successful run contains
up to 20 source-ordered results. Each result combines immutable observed metrics with the
canonical current Product. Poll `api.public.operation.get`, then read
`api.public.catalog.run.get` with the returned `catalogSearchRun.runId`.

Catalog search consumes one license usage unit only when it creates external work. Reused runs,
joined pending work, Operation polls, and run reads do not consume another unit. Provider token
state is never returned.

## Contract source

Use these sources when exact generated types or implementation behavior matter:

- [`router-public.ts`](../../apps/server/src/api/router-public.ts) — publishable router type.
- [`product-read-model.ts`](../../apps/server/src/services/product-read-model.ts) — rich product
  response and partial-success behavior.
- [`product-history-agent.ts`](../../apps/server/src/services/product-history-agent.ts) — agent
  history response.
- [`ProductInfo`](../../apps/server/src/types/index.ts) — summary fields and units.
