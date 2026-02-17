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

const product = await client.getProductInfo.mutate({
  marketplaceId: 'ATVPDKIKX0DER',
  asin: 'B0DV53VS61'
});
```

The client is scoped to the public surface (`api.public.*`) so it stays aligned with CLI usage.

## Types

```ts
import type { PublicRouterInputs, PublicRouterOutputs } from '@rankwrangler/http-client';

type GetProductInput = PublicRouterInputs['getProductInfo'];
type GetProductOutput = PublicRouterOutputs['getProductInfo'];
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

## Publish

From `packages/http-client`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

Before publishing:

1. Bump `version` in `packages/http-client/package.json`.
2. Run `bun run http-client:build` from repo root.
3. Run `npm pack --dry-run` from `packages/http-client`.

## Versioning

- App releases are tracked in root `CHANGELOG.md` as `vX.Y.Z` entries.
- npm client releases are tracked in `packages/http-client/package.json` with SemVer.
- These two version tracks are related but independent.
