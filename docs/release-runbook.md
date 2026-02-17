# Release Runbook

Canonical release process for synchronized version bumps and npm publishes.

## Goal

Keep all release versions synchronized to the same `X.Y.Z` across:

- `CHANGELOG.md` (`vX.Y.Z`)
- app package versions in `apps/*/package.json`
- package versions in `packages/*/package.json`

## Prerequisites

- Repo-root `.env` contains a valid `NPM_TOKEN`.
- Repo-root `.npmrc` is configured for npm registry auth.
- You are on the release branch with only intended release changes.

## 1. Choose Release Version

Pick a target version (example: `0.1.2`).

Update:

- `CHANGELOG.md` with `## v0.1.2 - YYYY-MM-DD`
- `apps/server/package.json`
- `apps/website/package.json`
- `apps/extension/package.json`
- `apps/extension/safari-extension/package.json`
- `packages/http-client/package.json`
- `packages/cli/package.json`

## 2. Build And Prepare

Run from repo root:

```bash
bun install
bun run http-client:build
bun run cli:build
```

## 3. Publish HTTP Client First

Run from `packages/http-client`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

## 4. Resolve Tarball URL From npm (Do Not Guess)

Run from repo root after publish:

```bash
HTTP_CLIENT_TARBALL_URL="$(
  npm view @rankwrangler/http-client@0.1.2 dist.tarball --userconfig .npmrc
)"
echo "$HTTP_CLIENT_TARBALL_URL"
```

Use this exact URL in `apps/extension/package.json` for
`@rankwrangler/http-client`.

## 5. Wait For Tarball Propagation

Even after successful publish, the tarball may return `404` briefly.

```bash
until [ "$(curl -s -o /dev/null -w "%{http_code}" "$HTTP_CLIENT_TARBALL_URL")" = "200" ]; do
  sleep 3
done
```

## 6. Publish CLI

Run from `packages/cli`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

## 7. Final Validation

Run from repo root:

```bash
bun install
npm view @rankwrangler/http-client version --userconfig .npmrc
npm view @rankwrangler/cli version --userconfig .npmrc
bun run --filter rankwrangler-extension build
```

## Fast Failure Handling

- `401 Unauthorized`:
  Load `.env` before publish and use `--userconfig ../../.npmrc`.
- `403 cannot publish over previously published versions`:
  Bump version and retry publish.
- Publish succeeds but tarball is `404`:
  Wait for propagation using the loop above.
- Keep release scope tight:
  Only version files, lockfile, changelog, and required pinned dependency updates.
