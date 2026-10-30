# @rankwrangler/http-client

Typed tRPC client for the RankWrangler public agent API.

Unified search and `keyword.results` below describe prepared source changes. Database migration,
package release, and production deployment are pending.

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

const observedResults = await client.keyword.results.mutate({
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

The client is scoped to `api.public.*`. Product `search` reads the stored catalog and returns
`{ items, nextCursor, coverage }` without provider calls. Its optional term, filters, and sorting
screen compact Products with market metrics. `keyword.results` preserves dated external search
evidence and can wait for collection under the existing 24-hour reuse policy.

Product `get` returns the current Product. `getMany` returns basic listing data, and `history`
returns compact rank and price series. Keyword `get` and `search` read the stored keyword directory, separately from observed search results. Retryable `TIMEOUT` errors preserve retry hints.

## Types

```ts
import type { PublicRouterInputs, PublicRouterOutputs } from '@rankwrangler/http-client';

type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type KeywordSearchOutput = PublicRouterOutputs['keyword']['search'];
```

When the public router changes, regenerate and build the declarations:

```bash
bun run http-client:types
bun run http-client:build
```

See the [HTTP client reference](../../docs/reference/http-client.md) for transport options and
release workflow.
