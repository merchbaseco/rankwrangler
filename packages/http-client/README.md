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

1. Run `bun run release:bump <patch|minor|major|X.Y.Z>` from repo root.
2. Run `bun install` from repo root.
3. Run `bun run release:collect-changelog-context`, then draft `CHANGELOG.md` entry.
4. Run `bun run release:check`.
5. Run `bun run http-client:build` from repo root.
6. Run `npm pack --dry-run` from `packages/http-client`.

## Versioning

- App releases and npm package versions are synchronized to the same `X.Y.Z`.
- `CHANGELOG.md` uses `vX.Y.Z`; package files use `X.Y.Z`.
- Canonical process lives in `docs/release-runbook.md`.
