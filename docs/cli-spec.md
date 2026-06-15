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

- Config-first state. API/config commands never prompt; `auth set` may prompt only for local
  secret entry.
- Resource-first, verb-second command shape.
- JSON-only output for API/config commands.
- Text output is reserved for CLI meta commands (`--help`, `--version`, `changelog`).
- One CLI command maps to one API capability.
- CLI and HTTP public API stay aligned as one canonical surface.
- No legacy aliases or compatibility command shims unless explicitly requested.

## Command Shape

- Meta commands:
  - `rw --version`
  - `rw changelog`
- Pattern: `rw <resource> <verb> [args...] [flags...]`
- Alias pattern: `rankwrangler <resource> <verb> [args...] [flags...]`
- Current resources:
  - `products`
  - `license`
  - `auth`
  - `config`

## Response Envelope

Success:

```json
{"ok": true, "data": {}}
```

Failure:

```json
{"ok": false, "error": {"code": "MISSING_CONFIG", "message": "license key is required. run `rw auth set`, `rw auth set --stdin`, or set RR_LICENSE_KEY"}}
```

`rw --version` prints the installed package version as plain text.
`rw changelog` prints the latest bundled `CHANGELOG.md` release entry as plain text.

## Config

Default config path: `~/.rankwrangler/config.json`.
Global storage pointer path: `~/.rankwrangler/global.json`.

Supported keys:

- `base-url`
- `marketplace`
- `storage-dir`

Commands:

- `rw config show`
- `rw config get <key>`
- `rw config set base-url <origin>`
- `rw config set marketplace <marketplaceId>`
- `rw config set storage-dir <path>`
- `rw config unset <key>`
- `rw config reset`

`base-url` accepts an origin with or without trailing `/api`.
`storage-dir` resolves to an absolute path, saves globally, and makes that directory the active
location for CLI config/data on later commands. When switching to a new directory, existing
config values are copied over for any keys the target config does not already define.
Secrets are not stored in CLI config.
Environment variables win over saved CLI config for `base-url`, `marketplace`, and `storage-dir`.
`config show` includes auth source/status metadata without printing secrets.
`config unset storage-dir` returns the CLI to the default storage directory. `config reset` removes
non-secret CLI config and the global storage pointer; it does not clear secure-store auth.

## Auth

License key persistence lives in the platform secure store, not `config.json`.

Commands:

- `rw auth status`
- `rw auth set [licenseKey]`
- `rw auth set --stdin`
- `rw auth clear`

Auth resolution order:

- `RR_LICENSE_KEY`
- stored key from the platform secure store
- otherwise fail with `MISSING_CONFIG`

`rw auth set` stores the provided key in the platform secure store. If `<licenseKey>` is omitted,
the command reads from `--stdin`, then `RR_LICENSE_KEY`, then an interactive hidden prompt when
attached to a terminal.
`rw auth status` returns JSON describing the active source (`env`, `secure-store`, or `none`) and
the secure-store backend status.
`rw auth clear` removes the stored key from the secure store.

## API Commands

- `rw products get <ASIN...> [--marketplace <id>|-m <id>]`
- `rw products history <ASIN> [--metrics <bsr,price>] [--bucket <auto|day|week|month>] [--days <N>|--startAt <ISO> --endAt <ISO>] [--marketplace <id>|-m <id>]`
- `rw license status`
- `rw license validate`

`products get` accepts one or many ASINs and internally chooses the single or batch API call.
`products history` accepts one ASIN and returns token-efficient metric buckets for agents.
It ensures product cache and history import before returning; agents do not run a separate
`products get` or retry loop first.
Agent history uses `schemaVersion: 2`, `range.bucket`, per-metric `buckets`, and per-metric
`summary`. It never returns raw point series through the CLI.

`products history` metric aliases map to Keepa-backed public metrics:

- `bsr` -> `bsrMain`
- `price` -> `priceNew` (same price metric shown in dashboard history)

Bucket options:

- `auto` -> day for ranges up to 45 days, week for ranges up to 18 months, month after that
- `day`
- `week`
- `month`

Marketplace resolution for product commands:

- `--marketplace <id>` / `-m <id>` (recommended override)
- configured `marketplace` from the active CLI storage directory's `config.json`
- `RR_MARKETPLACE_ID`
- default: `ATVPDKIKX0DER`

Storage directory resolution:

- `RR_STORAGE_DIR`
- saved global storage pointer in `~/.rankwrangler/global.json`
- default: `~/.rankwrangler`

These commands map directly to public API capabilities:

- `products get` -> `api.public.getProductInfo` (one ASIN) or `api.public.getProductInfoBatch` (many ASINs)
- `products history` -> `api.public.getProductHistory` (`format: "agent"`)
- `license status` -> `api.public.license.status`
- `license validate` -> `api.public.license.validate`

Product behavior lives in shared server services. Public and app routers are auth wrappers over the
same product lookup/history contracts.

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
node ../../scripts/release/with-npm-token.mjs npm whoami --userconfig ../../.npmrc
node ../../scripts/release/with-npm-token.mjs npm publish --access public --userconfig ../../.npmrc
```

`npm publish` fails fast unless the matching `@rankwrangler/http-client` version has already been
published.

## Release Checklist

1. Run `bun run release:bump <patch|minor|major|X.Y.Z>` from repo root.
2. Run `bun install` from repo root so `bun.lock` stays in sync.
3. Run `bun run release:collect-changelog-context`, then draft `CHANGELOG.md` entry.
4. Run `bun run release:check`, then `bun run cli:build`.
5. Run `bun run release:check-cli-pack` to validate packed npm artifact contents.
6. Publish `packages/http-client` first.
7. Publish from `packages/cli` using the commands above.
8. Verify package access status:

```bash
cd packages/cli
set -a
source ../../.env
set +a
npm access get status @rankwrangler/cli --userconfig ../../.npmrc
```

## Troubleshooting

- `401 Unauthorized` / token errors: ensure `NPM_TOKEN` is available in env or the macOS
  Keychain item `rankwrangler-npm-token` exists for account `$USER`.
- `403 You cannot publish over the previously published versions`: bump patch/minor version and
  publish again.
