---
summary: Defines build, authentication, publish order, and verification for the public RankWrangler HTTP client and CLI packages.
read_when:
  - publishing @rankwrangler/http-client or @rankwrangler/cli
  - diagnosing npm authentication, dependency ordering, or packed CLI failures
---

# npm Packages

Publish only after the synchronized release commit is on `origin/main`. The HTTP client must be
available first because the CLI publish guard requires its matching version.

## Preconditions

```bash
bun run release:check
bun run cli:build
bun run release:check-cli-pack
```

Authentication comes from an exported `NPM_TOKEN`, the repository-root `.env`, or the macOS
Keychain item `rankwrangler-npm-token` for account `$USER`, in that order. The repository helper
resolves those sources without putting the token in command history. It finds the root `.env` even
when invoked from either package directory.

## Publish

```bash
cd packages/http-client
node ../../scripts/release/with-npm-token.mjs npm whoami --userconfig ../../.npmrc
node ../../scripts/release/with-npm-token.mjs npm publish --access public --provenance=false --userconfig ../../.npmrc

cd ../cli
node ../../scripts/release/with-npm-token.mjs npm whoami --userconfig ../../.npmrc
node ../../scripts/release/with-npm-token.mjs npm publish --access public --provenance=false --userconfig ../../.npmrc
```

Local releases disable automatic provenance because npm only supports generating attestations from
recognized CI providers. Keep each package's `publishConfig.provenance` enabled for future CI-based
publishing.

Verify from the repository root:

```bash
npm view @rankwrangler/http-client version --userconfig .npmrc
npm view @rankwrangler/cli version --userconfig .npmrc
```

`401` indicates missing authentication. `403 cannot publish over previously published versions`
requires a new version. `ETARGET` from the CLI means the matching client version is not yet
available.
