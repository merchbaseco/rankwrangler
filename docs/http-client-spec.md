# HTTP Client Spec (Typed npm)

This spec defines the public npm client package that exposes typed access to
the RankWrangler API without duplicating CLI or server logic.

Canonical release process: `docs/release-runbook.md`.

## Goals

- Provide a stable, typed JavaScript client for external codebases.
- Keep the surface area aligned with the CLI/public API so there is one canonical API surface.
- Avoid a separate REST surface that would need independent maintenance.

## Package

- Name: `@rankwrangler/http-client`
- Location: `packages/http-client`
- Output: `dist/` (ESM + `.d.ts`)

## Philosophy

- The client mirrors `api.public.*` and the CLI command surface.
- Typed inputs and outputs are derived from the server router, not duplicated.
- Publish manually to npm for now.

## Client Surface

- Primary entrypoint: `createRankWranglerClient({ baseUrl, apiKey, headers, batch })`
- Usage:

```ts
import { createRankWranglerClient } from '@rankwrangler/http-client';

const client = createRankWranglerClient({
    baseUrl: 'https://rankwrangler.merchbase.co',
    apiKey: 'rrk_...',
});

const product = await client.getProductInfo.mutate({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
});
```

## Types

- `PublicRouterInputs` and `PublicRouterOutputs` are exported for type-safe integration.
- These types are generated from `apps/server/src/api/router-public.ts`.

## Build + Publish

```bash
bun run http-client:build
```

```bash
cd packages/http-client
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

Bump `packages/http-client/package.json` before every publish.

## Versioning Policy

RankWrangler uses synchronized versions across releases:

- App release version in `CHANGELOG.md` (for example `v0.1.2`) and
- npm package version in `packages/http-client/package.json` (for example `0.1.2`)

must match for the same release.

Use SemVer for `@rankwrangler/http-client`:

- `MAJOR`: breaking changes to the published client contract (removed/renamed procedures, incompatible input/output changes).
- `MINOR`: backward-compatible additions to the public client surface.
- `PATCH`: backward-compatible fixes or internal improvements.

Release checklist for HTTP client changes:

1. Run `bun run release:bump <patch|minor|major|X.Y.Z>` from repo root.
2. Run `bun install` from repo root.
3. Run `bun run release:collect-changelog-context`, then draft `CHANGELOG.md` entry.
4. Run `bun run release:check`.
5. Run `bun run http-client:build`.
6. Publish with `npm publish --access public`.
