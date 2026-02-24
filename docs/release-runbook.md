# Release Runbook

Canonical release process for synchronized version bumps and npm publishes.

## Goal

Keep release versions synchronized to the same `X.Y.Z` across these primary release surfaces:

- `CHANGELOG.md` (`vX.Y.Z`)
- `apps/server/package.json`
- `packages/http-client/package.json`
- `packages/cli/package.json`
- `apps/website` dashboard footer version (`VITE_APP_VERSION`, derived from
  `apps/server/package.json`)

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
- `apps/extension/package.json` (`@rankwrangler/http-client: ^X.Y.Z`)
- `apps/website` footer version is auto-derived from `apps/server/package.json` in
  `apps/website/vite.config.ts` (verify this link remains intact; no manual footer edit)

## 2. Build And Prepare

Run from repo root:

```bash
bun install
bun run http-client:build
bun run cli:build
bun run --filter rankwrangler-extension build
```

## 3. Confirm Scope And Get Publish Approval

Before any npm publish:

- Report that version/changelog updates are complete.
- Ask for explicit publish approval (example: `Do you want me to publish to npm now?`).
- Do not publish until the user confirms.

## 4. Commit And Push Release Changes

After approval, commit all release-version changes and push directly to `origin/main`
before publishing.

```bash
git add CHANGELOG.md apps/server/package.json packages/http-client/package.json \
  packages/cli/package.json apps/extension/package.json bun.lock
git commit -m "release: vX.Y.Z"
git push origin main
```

## 5. Publish HTTP Client First

Run from `packages/http-client`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
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
rg -n "VITE_APP_VERSION" apps/website/src/components/dashboard/app/dashboard-footer.tsx
```

## Fast Failure Handling

- `401 Unauthorized`:
  Load `.env` before publish and use `--userconfig ../../.npmrc`.
- `403 cannot publish over previously published versions`:
  Bump version and retry publish.
- Keep release scope tight:
  Only version files, lockfile, changelog, and required dependency updates.
