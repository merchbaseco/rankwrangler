---
summary: Defines construction, authentication, batching, generated types, and final public agent calls for @rankwrangler/http-client.
read_when:
  - integrating RankWrangler into TypeScript or JavaScript without spawning the CLI
  - changing the public router, generated client types, client options, or HTTP links
---

# HTTP Client

**Status:** Client construction and generated types are shipped. Retrieval inputs and outputs below
are the accepted public target.

`@rankwrangler/http-client` is the typed TypeScript/JavaScript client for the public tRPC surface.
It owns transport wiring and generated declarations; retrieval behavior remains on the server.

## Install and use

```bash
npm install @rankwrangler/http-client
```

```ts
import { createRankWranglerClient } from '@rankwrangler/http-client';

const client = createRankWranglerClient({
    baseUrl: 'https://rankwrangler.merchbase.co',
    headers: {
        Authorization: `Bearer ${clerkOAuthAccessToken}`,
    },
});

const product = await client.product.get.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
});

const basicProducts = await client.product.getMany.mutate({
    products: [
        { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0DV53VS61' },
        { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
    ],
});

const search = await client.product.search.mutate({
    term: 'retro gardening shirt',
});

const history = await client.product.history.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
    metrics: ['salesRank', 'price'],
});

const keyword = await client.keyword.get.query({
    keyword: 'retro gardening shirt',
});
```

`search` contains `keyword`, `searchedAt`, and compact `results`; each result nests its
`organicSearchPlacement` and compact `product`. It is not an array of full Product responses.
History output uses `range.interval`; every requested series has an always-present nullable summary,
and price history has no scale field.

The returned proxy is already scoped to `api.public`; call `client.product...` and
`client.keyword...`, not `client.api.public...`.

## Options

| Option | Contract |
| --- | --- |
| `baseUrl` | Required origin. Trailing slashes are removed; the client appends `/api`. |
| `apiKey` | Optional Merchbase API key sent as `Authorization: Bearer ...`. |
| `headers` | Optional additional request headers. |
| `batch` | Use tRPC HTTP batching; defaults to `true`. Set `false` for one request per call. |

An explicit `Authorization` value in `headers` takes precedence over the `apiKey` header.

## Generated types

```ts
import type {
    PublicRouterInputs,
    PublicRouterOutputs,
} from '@rankwrangler/http-client';

type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductGetManyOutput = PublicRouterOutputs['product']['getMany'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type ProductHistoryOutput = PublicRouterOutputs['product']['history'];
type KeywordSearchOutput = PublicRouterOutputs['keyword']['search'];
```

The package also exports `RankWranglerClient`, `RankWranglerClientOptions`, `RouterInputs`,
`RouterOutputs`, and `DEFAULT_API_BASE_URL`.

Declarations are generated from
[`apps/server/src/api/router-public.ts`](../../apps/server/src/api/router-public.ts):

```bash
bun run http-client:types
bun run http-client:build
```

Commit the regenerated `packages/http-client/src/app-router.d.ts` with public-router changes.

## Errors and runtime behavior

Calls return ordinary tRPC promises and reject with tRPC client errors. `NOT_FOUND` identifies
missing data. `TIMEOUT` identifies provider-neutral temporary unavailability and includes a
`Retry after N seconds` hint. Auth and allowance errors remain `UNAUTHORIZED`, `FORBIDDEN`,
`SERVICE_UNAVAILABLE`, or `TOO_MANY_REQUESTS`; allowance errors include a retry hint for the next
daily reset.

The client never polls. Every Product and keyword procedure returns policy-current final data or a
standard error. Missing or policy-expired data may wait while durable work continues. Product
`get`/`getMany`/`history` and keyword inputs expose no refresh control; Product Search retains its
separate search input. Product `get`/`getMany`/`history` and keyword outputs expose no stale/pending
data, freshness, Operations, provider status or schema version.
Generated Product output preserves nullable `isMerchListing` knowledge; consumers must not coerce
`null` to `false`.

The implementation is [`packages/http-client/src/index.ts`](../../packages/http-client/src/index.ts).
