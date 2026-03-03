# RankWrangler

Monorepo containing the RankWrangler server, website, and browser extension.

## Apps

- `apps/server` – Fastify-based tRPC API for Amazon SP-API integration
  - SP-API sync treats missing catalog payloads as product removals, logs `product.deleted`,
    and deletes the corresponding row from `products`
  - Keepa sync policy is BSR-tiered for merch (`<300k` automatic daily, `<1M` automatic weekly,
    `>=1M` on-demand), with a strict global minimum 24h fetch gap per ASIN
  - Product facets are AI-classified asynchronously (Gemini 2.5 Flash Lite) into normalized
    facet categories for dashboard filtering, and can be manually triggered per product from
    the product drawer
- `apps/website` – Dashboard for API keys, usage, recent products, Logs, and admin metrics
  pages for Keepa/SP-API/facets/Top Search Terms operations
  - Product facet sidebar filters are sourced from canonical assigned facet values in the server
    response (not only from currently loaded table rows)
  - Product side drawer header displays assigned facets as badges
- `apps/extension` – Chrome extension

## Packages

- `packages/http-client` – Typed tRPC client + public API types for extension/CLI
- `packages/cli` – Publishable CLI package (`@rankwrangler/cli`)
- `packages/history-chart` – Shared Recharts history chart + range-selection logic used by website + extension

## API Design

- All API surfaces are tRPC (no REST).
- Public surface: `api.public.*` (license key auth).
- App surface: `api.app.*` (Clerk auth).
- Dev automation helper: `api.public.dev.createClerkSignInToken` (localhost + non-production only).
- Shared behavior should live in utilities/libs, then be used by both routers.
- Each tRPC procedure lives in its own file under `apps/server/src/api/public` or `apps/server/src/api/app`.

## CLI

- npm package: `@rankwrangler/cli`
- Install globally: `npm install -g @rankwrangler/cli`
- Build locally: `bun run cli:build`
- Binaries: `rw` (primary), `rankwrangler` (alias)
- The CLI uses `@rankwrangler/http-client` and the same `api.public.*` surface as HTTP clients.
- Command shape is resource-first (`products get`, `license status`).
- History command: `products history <ASIN>` with agent-focused aliases (`--metrics bsr,price`).
- Product commands default marketplace to `ATVPDKIKX0DER` and support `--marketplace` / `-m` override.
- Spec: `docs/cli-spec.md`
- Release workflow: `docs/cli-spec.md`

## HTTP Client

- npm package: `@rankwrangler/http-client`
- Build: `bun run http-client:build`
- Publish guide: `docs/http-client-spec.md`

## Tooling

- Bun workspaces (`package.json` at repo root)

## Extension UI Preview

Use this to preview extension UI surfaces locally without rebuilding/reloading
Chrome:

```bash
bun run preview:chrome
```

## Release

- Canonical runbook: `docs/release-runbook.md`
- One-command bump: `bun run release:bump patch` (or `minor` / `major` / explicit `X.Y.Z`)
- AI command (`do a version bump`): `docs/ai-commands/version-bump/README.md`
- Changelog context export: `bun run release:collect-changelog-context`
- Release integrity checks: `bun run release:check && bun run cli:build && bun run release:check-cli-pack`
- Tag push (`vX.Y.Z`) publishes GitHub release notes from the matching `CHANGELOG.md` entry

## Quick Start

```bash
bun install
bun --filter @rankwrangler/server run build
```

For server-specific docs, see `docs/server/index.md`.
For BA Top Search Terms implementation details, see `docs/server/ba-top-search-terms-system.md`.

## Optional Environment

- `GEMINI_API_KEY` enables asynchronous product facet classification.
