# Release Runbook

Canonical process for synchronized version bumps, tag-based release tracking, and npm publishes.

## Goal

Keep these release surfaces synchronized to one `X.Y.Z`:

- `CHANGELOG.md` (`vX.Y.Z` heading)
- `apps/server/package.json`
- `packages/http-client/package.json`
- `packages/cli/package.json`
- `packages/cli/package.json` dependency `@rankwrangler/http-client: ^X.Y.Z`
- `apps/extension/package.json` dependency `@rankwrangler/http-client: ^X.Y.Z`
- `apps/website` footer version derives from `apps/server/package.json`

Changelog policy:

- Do not maintain a persistent `## Unreleased` section.
- Update `CHANGELOG.md` only during version bump/release prep.

## SemVer Prompt Policy (Agent Behavior)

- Do not proactively mention version bumps for non-breaking API changes.
- If a change is backward-incompatible, always mention it and suggest a version bump.
- Breaking-change guidance:
  - `0.x.y` -> recommend `minor`.
  - `1.x.y+` -> recommend `major`.

Compatibility posture:

- Prefer clean breaks over compatibility layers.
- Do not add legacy aliases/fallbacks unless explicitly requested.

## Prerequisites

- Repo-root `.env` has valid `NPM_TOKEN`.
- Repo-root `.npmrc` is configured for npm auth.
- Release branch has only intended release changes.
- AI command playbook: `docs/ai-commands/version-bump/README.md`.

## 1. Bump Version (One Command)

From repo root, run exactly one of:

```bash
bun run release:bump patch
bun run release:bump minor
bun run release:bump major
bun run release:bump X.Y.Z
```

This command updates:

- synchronized package versions
- `@rankwrangler/http-client` dependency pins in CLI + extension
- it does not update `CHANGELOG.md`

Then refresh lockfile:

```bash
bun install
```

## 2. Build Changelog Entry (AI-Assisted)

Collect deterministic commit context:

```bash
bun run release:collect-changelog-context
```

Optional baseline override:

```bash
bun run release:collect-changelog-context --since-ref <git-ref>
```

Then draft `CHANGELOG.md` entry manually using AI judgment:

- add top heading `## vX.Y.Z - YYYY-MM-DD`
- group into `### Added`, `### Changed`, `### Fixed`
- summarize user-facing outcomes from commits

## 3. Verify Release Integrity

Run from repo root:

```bash
bun run release:check
bun run cli:build
bun run release:check-cli-pack
bun run --filter rankwrangler-extension build
```

`release:check-cli-pack` validates the packed npm artifact includes
`products history` and `--metrics` support before publish.

## 4. Commit + Tag (Source of Truth)

After verification:

```bash
git add CHANGELOG.md apps/server/package.json packages/http-client/package.json \
  packages/cli/package.json apps/extension/package.json bun.lock
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "release: vX.Y.Z"
git push origin main --follow-tags
```

Tag `vX.Y.Z` is the canonical commit boundary for that build.

## 5. GitHub Release Notes (Auto)

Pushing tag `vX.Y.Z` triggers `.github/workflows/release-integrity.yml` to:

- run release metadata validation
- build and inspect packed CLI artifact
- generate GitHub release notes for that tag

This makes commit-to-version mapping explicit in GitHub Releases.

## 6. Publish HTTP Client First

Only after the release commit has been pushed to `origin/main`.

Run from `packages/http-client`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

## 7. Publish CLI

Only after the release commit has been pushed to `origin/main`.

Run from `packages/cli`:

```bash
set -a
source ../../.env
set +a
npm whoami --userconfig ../../.npmrc
npm publish --access public --userconfig ../../.npmrc
```

## 8. Final Validation

Run from repo root:

```bash
npm view @rankwrangler/http-client version --userconfig .npmrc
npm view @rankwrangler/cli version --userconfig .npmrc
```

## Fast Failure Handling

- `401 Unauthorized`: load `.env` before publish and use `--userconfig ../../.npmrc`.
- `403 cannot publish over previously published versions`: bump version and retry.
- Keep release scope tight: only version files, lockfile, changelog, and required dependency updates.
