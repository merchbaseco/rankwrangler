# @rankwrangler/cli

Official CLI for RankWrangler.

## Install

```bash
npm install -g @rankwrangler/cli
```

## Usage

```bash
rw --version
rw changelog
rw auth set rrk_...
rw config set storage-dir ~/.config/rankwrangler
rw products get B0DV53VS61
rw products history B0DV53VS61 --metrics bsr,price
RR_LICENSE_KEY=rrk_... rw license status
# `rankwrangler` is also supported as an alias
```

`rw auth set <licenseKey>` stores the license key in the platform secure store
(`macOS Keychain` on macOS). `rw auth status` reports whether the CLI will use an env override,
stored auth, or no auth. `rw auth clear` removes the stored key.

`rw config set storage-dir <path>` saves the active storage directory globally. After that, every
CLI command reads and writes its non-secret config/data from that directory, while preserving
existing config values when switching. `RR_LICENSE_KEY`, `RR_STORAGE_DIR`, `RR_API_URL`, and
`RR_MARKETPLACE_ID` override saved CLI state when set for CI, automation, or agent runtimes.
`rw --version` prints the installed CLI version. `rw changelog` prints the latest bundled release
notes shipped with the package.

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
