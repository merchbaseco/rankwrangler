# RankWrangler

Monorepo containing the RankWrangler server, website, and browser extension.

## Apps

- `apps/server` – Fastify-based API for Amazon SP-API integration
- `apps/website` – Website (hello world placeholder)
- `apps/extension` – Chrome extension

## Tooling

- Bun workspaces (`package.json` at repo root)

## Quick Start

```bash
bun install
bun --filter @rankwrangler/server run build
```

For server-specific docs, see `apps/server/README.md`.
