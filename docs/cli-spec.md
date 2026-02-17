# RankWrangler CLI Spec

This spec defines the public, user-facing shape of the RankWrangler CLI.

Canonical release process: `docs/release-runbook.md`.

## Package

- Name: `@rankwrangler/cli`
- Location: `packages/cli`
- Binary: `rankwrangler`
- Install: `npm install -g @rankwrangler/cli`

## Principles

- Config-first state. No prompts or interactive flows.
- Resource-first, verb-second command shape.
- JSON-only output.
- One CLI command maps to one API capability.
- CLI and HTTP public API stay aligned as one canonical surface.

## Command Shape

- Pattern: `rankwrangler <resource> <verb> [args...] [flags...]`
- Current resources:
  - `products`
  - `license`
  - `config`

## Response Envelope

Success:

```json
{"ok": true, "data": {}}
```

Failure:

```json
{"ok": false, "error": {"code": "MISSING_CONFIG", "message": "api key is required. set via `config set api-key <value>`"}}
```

## Config

Local config path: `~/.rankwrangler/config.json`.

Supported keys:

- `api-key`
- `base-url`
- `marketplace`

Commands:

- `rankwrangler config show`
- `rankwrangler config clear`
- `rankwrangler config set api-key <value>`
- `rankwrangler config set base-url <origin>`
- `rankwrangler config set marketplace <marketplaceId>`

`base-url` accepts an origin with or without trailing `/api`.

## API Commands

- `rankwrangler products get <ASIN...> [--marketplace <id>|-m <id>]`
- `rankwrangler license status`
- `rankwrangler license validate`

`products get` accepts one or many ASINs and internally chooses the single or batch API call.

Marketplace resolution for product commands:

- `--marketplace <id>` / `-m <id>` (recommended override)
- `--marketplaceId <id>` (compatibility alias)
- configured `marketplace` from `~/.rankwrangler/config.json`
- `RR_MARKETPLACE_ID`
- default: `ATVPDKIKX0DER`

These commands map directly to public API capabilities:

- `products get` -> `api.public.getProductInfo` (one ASIN) or `api.public.getProductInfoBatch` (many ASINs)
- `license status` -> `api.public.license.status`
- `license validate` -> `api.public.license.validate`

## Compatibility

Legacy aliases are still accepted:

- `get-product-info`
- `get-product-info-batch`
- `products get-batch`

## Build + Publish

```bash
bun run cli:build
```

```bash
cd packages/cli
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

## Release Checklist

1. Bump `version` in `packages/cli/package.json` to match the target `vX.Y.Z` in `CHANGELOG.md`.
2. Run `bun install` from repo root so `bun.lock` stays in sync.
3. Run `bun run cli:build` from repo root.
4. Publish from `packages/cli` using the commands above.
5. Verify package access status:

```bash
cd packages/cli
set -a
source ../../.env
set +a
npm access get status @rankwrangler/cli --userconfig ../../.npmrc
```

## Troubleshooting

- `401 Unauthorized` / token errors: ensure repo-root `.env` is loaded before publish so
  `NPM_TOKEN` is available to `.npmrc`.
- `403 You cannot publish over the previously published versions`: bump patch/minor version and
  publish again.
