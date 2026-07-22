---
summary: Defines construction, authentication, batching, generated types, and product calls for the @rankwrangler/http-client package.
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
    apiKey: process.env.RR_LICENSE_KEY,
});

const product = await client.product.get.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
    metrics: ['bsr', 'price'],
    bucket: 'auto',
});
```

The returned proxy is already scoped to `api.public`; callers use `client.product...`, not
`client.api.public.product...`.

## Options

| Option | Contract |
| --- | --- |
| `baseUrl` | Required origin. Trailing slashes are removed; the client appends `/api`. |
| `apiKey` | Optional license key sent as `Authorization: Bearer ...`. Public calls fail without valid auth. |
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

The client does not add retries, polling, caching, or an operation lifecycle. Product methods have
the same synchronous request contract documented in the [public API](public-api.md).

The implementation is [`packages/http-client/src/index.ts`](../../packages/http-client/src/index.ts).
