# @rankwrangler/cli

Official CLI for RankWrangler.

## Install

```bash
npm install -g @rankwrangler/cli
```

## Usage

```bash
export RR_LICENSE_KEY=rrk_...
rw config set storage-dir ~/.config/rankwrangler
rw products get B0DV53VS61
rw products history B0DV53VS61 --metrics bsr,price
# `rankwrangler` is also supported as an alias
```

`RR_LICENSE_KEY` is the API-key source. `rw config set storage-dir <path>` saves the
active storage directory globally. After that, every CLI command reads and writes its non-secret
config/data from that directory, while preserving existing config values when switching.
`RR_STORAGE_DIR`, `RR_API_URL`, and `RR_MARKETPLACE_ID` override saved CLI config when set.

## Development

```bash
bun run cli:build
bun run cli:test:e2e
```

## Release (Maintainers)

From repo root:

```bash
bun run release:bump patch
bun install
bun run release:collect-changelog-context
# draft CHANGELOG.md entry from commit context
bun run release:check
bun run cli:build
bun run release:check-cli-pack
```

Then publish:

Publish `packages/http-client` first. `packages/cli` now fails fast on `npm publish` until the
matching `@rankwrangler/http-client` version is already available on npm.

```bash
cd packages/cli
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```
