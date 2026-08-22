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

Authentication comes from an exported `RANKWRANGLER_NPM_PUBLISH_TOKEN`, or — when that is absent —
from `op://Tooling/NPM Publish - RankWrangler` resolved through `varlock printenv` under the
`RANKWRANGLER_RESOLVE_RELEASE_TOKENS` switch. Publishing is its own resolution context, separate
from install and deploy, and it is the only thing that reaches the `Tooling` vault. The repository
helper resolves the token without putting it in command history; it never touches a `.env` file or
the macOS Keychain.

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
