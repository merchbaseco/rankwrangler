# @rankwrangler/http-client

Typed tRPC client for the RankWrangler public agent API.

```bash
npm install @rankwrangler/http-client
```

```ts
import { createRankWranglerClient } from '@rankwrangler/http-client';

const client = createRankWranglerClient({
    baseUrl: 'https://rankwrangler-api.merchbase.co',
    apiKey: process.env.MERCHBASE_API_KEY,
});

const product = await client.product.get.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
});

const search = await client.product.search.query({
    term: 'retro gardening shirt',
});

const history = await client.product.history.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
    metrics: ['salesRank', 'price'],
    bucket: 'week',
});

const keywords = await client.keyword.list.query({
    term: 'retro gardening',
});
```

The client is scoped to `api.public.*`. Product `search` reads the stored catalog and returns
`{ items, nextCursor, coverage }`. Its optional term matches titles; filters and sorts screen flat
Products with market metrics, by default in `estimatedMonthlySalesDesc` order. It answers from
stored data only and never waits to collect a new term.

Product `get` returns the current Product. `getMany` takes `products`, unique
`{ marketplaceId, asin }` pairs, and returns basic listing data. `history` returns compact rank and
price series. Keyword `get` and `list` read the stored keyword directory. Retryable `TIMEOUT` errors preserve retry hints.

## Types

```ts
import type { PublicRouterInputs, PublicRouterOutputs } from '@rankwrangler/http-client';

type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type KeywordListOutput = PublicRouterOutputs['keyword']['list'];
```

When the public router changes, regenerate and build the declarations:

```bash
bun run http-client:types
bun run http-client:build
```

See the [HTTP client reference](../../docs/reference/http-client.md) for transport options and
release workflow.
