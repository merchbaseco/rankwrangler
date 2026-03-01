# @rankwrangler/cli

Official CLI for RankWrangler.

## Install

```bash
npm install -g @rankwrangler/cli
```

## Usage

```bash
rw config set api-key rrk_...
rw products get B0DV53VS61
rw products history B0DV53VS61 --metrics bsr,price
# `rankwrangler` is also supported as an alias
```

## Development

```bash
bun run cli:build
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

```bash
cd packages/cli
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```
