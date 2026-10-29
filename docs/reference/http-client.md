---
summary: Defines construction, authentication, batching, generated types, and final public agent calls for @rankwrangler/http-client.
read_when:
  - integrating RankWrangler into TypeScript or JavaScript without spawning the CLI
  - changing the public router, generated client types, client options, or HTTP links
---

# HTTP Client

**Status:** Unified search and `keyword.results` describe prepared source changes. Database
migration, package release, and production deployment are pending.

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
    include: ['marketData', 'shortName'],
});

const basicProducts = await client.product.getMany.mutate({
    products: [
        { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0DV53VS61' },
        { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
    ],
});

const search = await client.product.search.query({
    term: 'retro gardening shirt',
    salesRank: { max: 300_000 },
    sort: 'firstAvailableAtDesc',
});

const observedResults = await client.keyword.results.mutate({
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

`search` contains compact `items`, an opaque `nextCursor`, and nullable keyword `coverage`. It reads
stored Products without waiting for providers. `observedResults` contains `keyword`, `searchedAt`,
and source-ordered `results` with `organicSearchPlacement` and compact current `product` values.
See [Public API](public-api.md#product-search) for filters, text matching, paging, and coverage.
History output uses `range.interval`; every requested series has an always-present nullable summary,
and price history has no scale field.

The returned proxy is already scoped to `api.public`; call `client.product...` and
`client.keyword...`, not `client.api.public...`.
`include` defaults to `['marketData']`, preserving the Keepa-backed current Product read. Add
`shortName` for an image-informed compact label and `cutoutThumbnail` for a transparent 128-pixel
Product photo. Pass `['shortName', 'cutoutThumbnail']` for chip data without Keepa market data, or
`[]` to skip optional hydrations. The name and cutout remain nullable when omitted. `get` waits up
to 20 seconds for requested enrichment and returns an unfinished or failed field as none
(`shortName: null`, `cutoutThumbnail: { status: 'unavailable' }`) rather than a `TIMEOUT`; a later
`get` returns the finished value. Batch Product reads do not accept these options; request
enrichment with one `get` per Product.

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

The client never polls. Product search returns stored data or a standard error. Other Product and keyword procedures
apply their retrieval policies. Missing or policy-expired data may wait while durable work continues; Product
`get`/`getMany` instead return a known Product's last-known listing and refresh it in the
background. Product
`get`/`getMany`/`history`, Product search, and keyword directory inputs expose no refresh
control. `keyword.results` accepts `refresh` and retains the existing 24-hour run reuse and wait
behavior. Product `get`/`getMany`/`history` and keyword outputs expose no pending
data, freshness, Operations, provider status or schema version.
Generated Product output preserves nullable `isMerchListing` knowledge; consumers must not coerce
`null` to `false`. Basic `getMany` results always contain identity, nullable title, resolved
thumbnail, and `amazonListingStatus: active | deleted`. Active means the detail-page listing exists,
not that an offer is in stock or buyable. Deleted means Amazon has effectively removed the listing
from that marketplace. Retained listing values remain last-known data, while an unavailable
thumbnail alone only means no usable image.

The implementation is [`packages/http-client/src/index.ts`](../../packages/http-client/src/index.ts).
