---
summary: Defines the shipped Merchbase-credential tRPC transport, authentication, product inputs, history formats, and raw HTTP invocation pattern.
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

Public integration calls live under `api.public.*` and require a Merchbase API key or OAuth bearer;
the extension may use a transient Clerk session token for the same data procedures:

```http
Authorization: Bearer ak_... | oat_...
Content-Type: application/json
```

An invalid or absent credential produces tRPC `UNAUTHORIZED`; denied centralized access produces
`FORBIDDEN`; unavailable centralized access produces `SERVICE_UNAVAILABLE`; an exhausted Service
Account allowance produces `TOO_MANY_REQUESTS`. Clerk-authenticated `api.app.*` procedures are
dashboard application contracts, not part of the public integration surface.

## Raw request

tRPC mutations use an `input` envelope:

```bash
curl -s -X POST \
  https://rankwrangler.merchbase.co/api/api.public.product.get \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $MERCHBASE_API_KEY" \
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

- `status`: `ready` or `empty`;
- `freshness: { stale, updatedAt }` for the history data category;
- the resolved time range and bucket;
- optional `bsr` and `price` series.

`legacy` responses contain main-category BSR points and the same `freshness` envelope. Neither
format exposes an Operation identifier, polling state, or provider-specific availability fields.

`auto` resolves to day buckets through 45 days, week buckets through 18 months, and month buckets
for longer windows. BSR values are ranks. Price values are integer minor currency units with an
explicit currency and scale.

When collection is needed, the history request waits for the existing policy-compliant durable
work and returns the completed history. Concurrent equivalent requests join one collection. A
caller timeout detaches without cancelling that work. Temporary capacity or deadline failures use
tRPC `TIMEOUT` with a provider-neutral message containing `Retry after N seconds`; callers may
retry without creating duplicate provider work. A valid Product with no history returns a
successful empty result.

## Catalog search

`api.public.catalog.search` is a mutation with `term` and optional `maxAgeSeconds` (default
`86400`, maximum `604800`). It returns either:

- `{ status: "ready", run }` when a successful Search run satisfies the maximum age; or
- `{ status: "pending", queryId, operation }` when durable provider work is pending. `queryId`
  identifies the durable query read that the Operation will invalidate.

Set `maxAgeSeconds: 0` for fresh evidence; an identical pending query still joins one Operation.
The only V1 identity is Keepa, US marketplace, and zero-based page `0`. A successful run contains
up to 20 source-ordered results. Each result separates immutable observed metrics from the
nullable canonical current Product. Poll `api.public.operation.get`, then read
`api.public.catalog.run.get` with the returned `catalogSearchRun.runId`.

Catalog search consumes one mapped Service Account usage unit only when it creates external work. Reused runs,
joined pending work, Operation polls, and run reads do not consume another unit. Provider token
state is never returned.

Persisted Catalog query and run-list reads are tRPC queries and do not start provider work. A run
read may enqueue background Product enrichment for retained identities, but it never blocks on a
provider request:

- `api.public.catalog.query.get` resolves an existing query by `term` and returns normalized
  identity, activity timestamps, derived status, observation count, and latest-run metadata;
- `api.public.catalog.run.list` accepts `queryId`, `limit` (default 20, maximum 100), and an
  optional run-id `cursor`, then returns a newest-first page and `nextCursor`; and
- `api.public.catalog.run.get` reads one run's ordered results.

Run lists contain metadata only, including successful zero-result runs. A full result identifies
its retained `productId`, exposes `position: { source, value }`, keeps immutable metrics under
`observed`, and places canonical current state under nullable `currentProduct`. No read returns raw
provider payloads or Product-history arrays. Run metadata includes `trigger: requested | automatic`;
that provenance is not copied onto Products or individual result/currentProduct shapes.

The Clerk app router exposes the search request at `api.app.catalog.search.request`, completion
invalidation at `api.app.catalog.search.completed`, and an activity-aware
`api.app.catalog.query.list` read for Automation settings. A search request renews keyword interest
for 30 days, including cached reuse; active keywords are eligible for weekly automatic refresh and
expired keywords are inactive without backfill. Brand Analytics Top Search Terms remains a
separate automatic ingestion workflow.

## Contract source

Use these sources when exact generated types or implementation behavior matter:

- [`router-public.ts`](../../apps/server/src/api/router-public.ts) — publishable router type.
- [`product-read-model.ts`](../../apps/server/src/services/product-read-model.ts) — rich product
  response and partial-success behavior.
- [`product-history-agent.ts`](../../apps/server/src/services/product-history-agent.ts) — agent
  history response.
- [`ProductInfo`](../../apps/server/src/types/index.ts) — summary fields and units.
