---
summary: Defines construction, centralized authentication, batching, generated types, and product calls for the @rankwrangler/http-client package.
read_when:
  - integrating RankWrangler into TypeScript or JavaScript without spawning the CLI
  - changing the public router, generated client types, client options, or HTTP link behavior
---

# HTTP Client

`@rankwrangler/http-client` is the typed TypeScript/JavaScript client for the public tRPC surface.
It contains transport wiring and generated router declarations; product behavior remains on the
server.

## Install

```bash
npm install @rankwrangler/http-client
```

## Create a client

```ts
import { createRankWranglerClient } from '@rankwrangler/http-client';

const client = createRankWranglerClient({
    baseUrl: 'https://rankwrangler.merchbase.co',
    apiKey: process.env.MERCHBASE_API_KEY,
});

const product = await client.product.get.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
    metrics: ['bsr', 'price'],
    bucket: 'auto',
});

if (product.history.operation?.status === 'pending') {
    const operation = await client.operation.get.query({
        id: product.history.operation.id,
    });
}

const search = await client.catalog.search.mutate({
    term: 'retro gardening shirt',
    maxAgeSeconds: 0,
});

if (search.status === 'pending') {
    await client.operation.get.query({ id: search.operation.id });
}

const query = await client.catalog.query.get.query({
    term: 'retro gardening shirt',
});
const runs = await client.catalog.run.list.query({
    queryId: query.id,
    limit: 20,
});
```

The returned proxy is already scoped to `api.public`; callers use `client.product...`, not
`client.api.public.product...`.

## Options

| Option | Contract |
| --- | --- |
| `baseUrl` | Required origin. Trailing slashes are removed; the client appends `/api`. |
| `apiKey` | Optional Merchbase API key sent as `Authorization: Bearer ...`. Public calls fail without valid auth. |
| `headers` | Optional additional request headers. |
| `batch` | Use tRPC HTTP batching; defaults to `true`. Set `false` for one HTTP request per call. |

Passing an explicit `Authorization` value in `headers` takes precedence over the header derived
from `apiKey`.

## Generated types

The package exports router-wide types:

```ts
import type {
    PublicRouterInputs,
    PublicRouterOutputs,
} from '@rankwrangler/http-client';

type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductGetOutput = PublicRouterOutputs['product']['get'];
type OperationGetOutput = PublicRouterOutputs['operation']['get'];
type CatalogSearchOutput = PublicRouterOutputs['catalog']['search'];
type CatalogQueryOutput = PublicRouterOutputs['catalog']['query']['get'];
type CatalogRunListOutput = PublicRouterOutputs['catalog']['run']['list'];
type CatalogRunOutput = PublicRouterOutputs['catalog']['run']['get'];
```

It also exports `RankWranglerClient`, `RankWranglerClientOptions`, `RouterInputs`,
`RouterOutputs`, and `DEFAULT_API_BASE_URL`.

Router declarations are generated from
[`apps/server/src/api/router-public.ts`](../../apps/server/src/api/router-public.ts). After changing
the public router:

```bash
bun run http-client:types
bun run http-client:build
```

Commit the regenerated `packages/http-client/src/app-router.d.ts` with the router change.

## Errors and runtime behavior

Calls return ordinary tRPC promises and reject with tRPC client errors. Server error codes such as
`UNAUTHORIZED`, `TOO_MANY_REQUESTS`, `NOT_FOUND`, and `BAD_REQUEST` are available through the tRPC
error data.

The client does not poll automatically. Product history methods return stored data plus a pending
Operation when collection is needed. Call `client.operation.get.query` after
`retryAfterSeconds`; polling is read-only and does not consume another external-work usage unit.

The implementation is [`packages/http-client/src/index.ts`](../../packages/http-client/src/index.ts).
