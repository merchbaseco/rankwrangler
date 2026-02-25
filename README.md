# RankWrangler

Monorepo containing the RankWrangler server, website, and browser extension.

## Apps

- `apps/server` – Fastify-based tRPC API for Amazon SP-API integration
- `apps/website` – Dashboard for API keys, usage, recent products, and a Logs page
  for user-facing product/history/job sync events
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

## Quick Start

```bash
bun install
bun --filter @rankwrangler/server run build
```

For server-specific docs, see `apps/server/README.md`.
