# @rankwrangler/http-client

Typed tRPC client for the RankWrangler public agent API.

```bash
npm install @rankwrangler/http-client
```

```ts
import { createRankWranglerClient } from '@rankwrangler/http-client';

const client = createRankWranglerClient({
    baseUrl: 'https://rankwrangler.merchbase.co',
    apiKey: process.env.MERCHBASE_API_KEY,
});

const product = await client.product.get.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
});

const search = await client.product.search.mutate({
    term: 'retro gardening shirt',
});

const history = await client.product.history.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
    metrics: ['salesRank', 'price'],
    bucket: 'week',
});

const keywords = await client.keyword.search.query({
    text: 'retro gardening',
});
```

The client is scoped to the final public surface (`api.public.*`). It exposes Product
`get/search/history` and keyword `get/search/history`; it does not expose Catalog, Operation,
polling procedures. Product `get` and `history`, plus keyword reads, expose no refresh controls;
Product search retains its separate search contract. Product `get` returns the provider-neutral
current Product shape; Product `history` returns compact rank/price series. `NOT_FOUND` and retryable
`TIMEOUT` errors are preserved from tRPC, with retry hints on temporary unavailability.

## Types

```ts
import type { PublicRouterInputs, PublicRouterOutputs } from '@rankwrangler/http-client';

type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type KeywordHistoryOutput = PublicRouterOutputs['keyword']['history'];
```

When the public router changes, regenerate and build the declarations:

```bash
bun run http-client:types
bun run http-client:build
```

See the [HTTP client reference](../../docs/reference/http-client.md) for transport options and
release workflow.
