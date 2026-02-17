# @merchbase/rankwrangler-cli

Official CLI for RankWrangler.

## Install

```bash
npm install -g @merchbase/rankwrangler-cli
```

## Usage

```bash
rankwrangler config set api-key rrk_...
rankwrangler products get B0DV53VS61
```

## Development

```bash
bun run cli:build
```

## Release (Maintainers)

```bash
cd packages/cli
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

If npm rejects the version as already published, bump `version` in
`packages/cli/package.json` to match the next `vX.Y.Z` release in `CHANGELOG.md`,
run `bun install` from repo root, and publish again.
