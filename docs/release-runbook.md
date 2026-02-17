# Release Runbook

Canonical release process for synchronized version bumps and npm publishes.

## Goal

Keep release versions synchronized to the same `X.Y.Z` across these primary release surfaces:

- `CHANGELOG.md` (`vX.Y.Z`)
- `apps/server/package.json`
- `packages/http-client/package.json`
- `packages/cli/package.json`

## SemVer Prompt Policy (Agent Behavior)

- Do not proactively mention version bumps for non-breaking API changes.
- If a change is backward-incompatible, always mention it and suggest a version bump.
- Breaking-change bump guidance:
  - `0.x.y` -> recommend a `minor` bump.
  - `1.x.y+` -> recommend a `major` bump.

Compatibility posture:

- Prefer clean breaks over compatibility layers.
- Do not add legacy aliases, fallbacks, or compatibility shims unless explicitly requested.

## Prerequisites

- Repo-root `.env` contains a valid `NPM_TOKEN`.
- Repo-root `.npmrc` is configured for npm registry auth.
- You are on the release branch with only intended release changes.

## 1. Choose Release Version

Pick a target version (example: `0.1.2`).

Update:

- `CHANGELOG.md` with `## v0.1.2 - YYYY-MM-DD`
- `apps/server/package.json`
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

## 4. Update Extension Dependency

After publishing the HTTP client, update `apps/extension/package.json`:

```bash
"@rankwrangler/http-client": "^X.Y.Z"
```

Replace it with the current release version (example: `^0.1.3`), then run:

```bash
bun install
```

## 5. Publish CLI

Run from `packages/cli`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

## 6. Final Validation

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
- Keep release scope tight:
  Only version files, lockfile, changelog, and required dependency updates.
