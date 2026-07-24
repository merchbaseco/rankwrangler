# @rankwrangler/http-client

Typed tRPC client for the RankWrangler public API.

## Install

```bash
npm install @rankwrangler/http-client
```

## Usage

```ts
import { createRankWranglerClient } from '@rankwrangler/http-client';

const client = createRankWranglerClient({
  baseUrl: 'https://rankwrangler.merchbase.co',
  apiKey: 'rrk_...'
});

const product = await client.product.get.mutate({
  marketplaceId: 'ATVPDKIKX0DER',
  asin: 'B0DV53VS61',
  metrics: ['bsr', 'price'],
  bucket: 'auto'
});

if (product.history.operation?.status === 'pending') {
  const operation = await client.operation.get.query({
    id: product.history.operation.id
  });
}

const search = await client.catalog.search.mutate({
  term: 'retro gardening shirt',
  maxAgeSeconds: 0
});

const query = await client.catalog.query.get.query({
  term: 'retro gardening shirt'
});
const runs = await client.catalog.run.list.query({
  queryId: query.id,
  limit: 20
});
```

The client is scoped to the public surface (`api.public.*`) so it stays aligned with CLI usage.

## Types

```ts
import type { PublicRouterInputs, PublicRouterOutputs } from '@rankwrangler/http-client';

type GetProductInput = PublicRouterInputs['product']['get'];
type GetProductOutput = PublicRouterOutputs['product']['get'];
type OperationGetOutput = PublicRouterOutputs['operation']['get'];
type CatalogQueryOutput = PublicRouterOutputs['catalog']['query']['get'];
type CatalogRunListOutput = PublicRouterOutputs['catalog']['run']['list'];
```

## Maintenance

When the public router changes, regenerate the bundled router types:

```bash
bun run http-client:types
```

Build the package before publishing:

```bash
bun run http-client:build
```

## Maintainers

See the repository [HTTP client reference](../../docs/reference/http-client.md),
[release workflow](../../docs/operations/releases.md), and
[npm publishing workflow](../../docs/operations/npm-packages.md).
