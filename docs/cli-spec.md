# RankWrangler CLI Spec

This spec defines the public, user-facing shape of the RankWrangler CLI.

Canonical release process: `docs/release-runbook.md`.

## Package

- Name: `@rankwrangler/cli`
- Location: `packages/cli`
- Binaries:
  - `rw` (primary)
  - `rankwrangler` (alias)
- Install: `npm install -g @rankwrangler/cli`

## Principles

- Config-first state. No prompts or interactive flows.
- Resource-first, verb-second command shape.
- JSON-only output.
- One CLI command maps to one API capability.
- CLI and HTTP public API stay aligned as one canonical surface.
- No legacy aliases or compatibility command shims unless explicitly requested.

## Command Shape

- Pattern: `rw <resource> <verb> [args...] [flags...]`
- Alias pattern: `rankwrangler <resource> <verb> [args...] [flags...]`
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
{"ok": false, "error": {"code": "MISSING_CONFIG", "message": "api key is required. set RR_LICENSE_KEY"}}
```

## Config

Default config path: `~/.rankwrangler/config.json`.
Global storage pointer path: `~/.rankwrangler/global.json`.

Supported keys:

- `base-url`
- `marketplace`
- `storage-dir`

Commands:

- `rw config show`
- `rw config clear`
- `rw config set base-url <origin>`
- `rw config set marketplace <marketplaceId>`
- `rw config set storage-dir <path>`

`base-url` accepts an origin with or without trailing `/api`.
`storage-dir` resolves to an absolute path, saves globally, and makes that directory the active
location for CLI config/data on later commands. When switching to a new directory, existing
config values are copied over for any keys the target config does not already define.
Secrets are not stored in CLI config; use `RR_LICENSE_KEY`.

## API Commands

- `rw products get <ASIN...> [--marketplace <id>|-m <id>]`
- `rw products history <ASIN> [--metrics <bsr,price>] [--days <N>|--startAt <ISO> --endAt <ISO>] [--limit <N>] [--marketplace <id>|-m <id>]`
- `rw license status`
- `rw license validate`

`products get` accepts one or many ASINs and internally chooses the single or batch API call.
`products history` accepts one ASIN and returns token-efficient metric series for agents.

`products history` metric aliases map to Keepa-backed public metrics:

- `bsr` -> `bsrMain`
- `price` -> `priceNew` (same price metric shown in dashboard history)

Marketplace resolution for product commands:

- `--marketplace <id>` / `-m <id>` (recommended override)
- configured `marketplace` from the active CLI storage directory's `config.json`
- `RR_MARKETPLACE_ID`
- default: `ATVPDKIKX0DER`

These commands map directly to public API capabilities:

- `products get` -> `api.public.getProductInfo` (one ASIN) or `api.public.getProductInfoBatch` (many ASINs)
- `products history` -> `api.public.getProductHistory` (`format: "agent"`)
- `license status` -> `api.public.license.status`
- `license validate` -> `api.public.license.validate`

## Compatibility Policy

- Legacy command aliases are not supported by default.
- Backward-compatibility shims require explicit direction.

## Build + Publish

```bash
bun run cli:build
bun run cli:test:e2e
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

1. Run `bun run release:bump <patch|minor|major|X.Y.Z>` from repo root.
2. Run `bun install` from repo root so `bun.lock` stays in sync.
3. Run `bun run release:collect-changelog-context`, then draft `CHANGELOG.md` entry.
4. Run `bun run release:check`, then `bun run cli:build`.
5. Run `bun run release:check-cli-pack` to validate packed npm artifact contents.
6. Publish from `packages/cli` using the commands above.
7. Verify package access status:

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
