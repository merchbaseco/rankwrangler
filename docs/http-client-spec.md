# HTTP Client Spec (Typed npm)

This spec defines the public npm client package that exposes typed access to
the RankWrangler API without duplicating CLI or server logic.

Canonical release process: `docs/release-runbook.md`.

## Goals

- Provide a stable, typed JavaScript client for external codebases.
- Keep the surface area aligned with the CLI/public API so there is one canonical API surface.
- Avoid a separate REST surface that would need independent maintenance.

## Package

- Name: `@merchbase/rankwrangler-http-client`
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
import { createRankWranglerClient } from '@merchbase/rankwrangler-http-client';

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
npm login
npm publish --access public
```

Bump `packages/http-client/package.json` before every publish.

## Versioning Policy

RankWrangler uses synchronized versions across releases:

- App release version in `CHANGELOG.md` (for example `v0.1.2`) and
- npm package version in `packages/http-client/package.json` (for example `0.1.2`)

must match for the same release.

Use SemVer for `@merchbase/rankwrangler-http-client`:

- `MAJOR`: breaking changes to the published client contract (removed/renamed procedures, incompatible input/output changes).
- `MINOR`: backward-compatible additions to the public client surface.
- `PATCH`: backward-compatible fixes or internal improvements.

Release checklist for HTTP client changes:

1. Run `bun run http-client:build`.
2. Bump `packages/http-client/package.json` to match the target release version.
3. Update `CHANGELOG.md` in the same PR with the matching `vX.Y.Z` release heading.
4. Publish with `npm publish --access public`.
