# AI Command: Do A Version Bump

Use this workflow when the user says: `do a version bump`.

This command intentionally splits work into:

- deterministic scripts for version math, dependency pinning, and validation
- AI judgment for changelog curation from commit history

## Deterministic Scripts

- `bun run release:bump <patch|minor|major|X.Y.Z>`
- `bun run release:collect-changelog-context [--since-ref <git-ref>] [--max-commits <N>]`
- `bun run release:check`
- `bun run cli:build`
- `bun run release:check-cli-pack`

## AI Responsibilities

After collecting commit context, the AI must:

- infer user-facing outcomes from commit subjects/diff context
- group outcomes into `### Added`, `### Changed`, `### Fixed`
- remove noise (internal cleanup/churn) unless user-visible
- call out breaking changes explicitly

The changelog should reflect product impact, not raw commit order.

## Command Procedure

1. Confirm bump type.
If user did not specify, ask exactly one question: `patch`, `minor`, `major`, or explicit version.

2. Run deterministic bump.

```bash
bun run release:bump <patch|minor|major|X.Y.Z>
```

3. Refresh lockfile.

```bash
bun install
```

4. Collect commit context.

```bash
bun run release:collect-changelog-context
```

If automatic commit baseline is wrong, rerun with:

```bash
bun run release:collect-changelog-context --since-ref <git-ref>
```

5. Draft changelog entry with AI judgment.
Insert a new top entry in `CHANGELOG.md`:

- heading: `## vX.Y.Z - YYYY-MM-DD`
- sections: `### Added`, `### Changed`, `### Fixed` as applicable
- concise bullet points focused on user-facing changes

Do not add or keep `## Unreleased`.
This entry is also used as the GitHub release notes body when tag `vX.Y.Z` is pushed.

6. Run validation/build checks.

```bash
bun run release:check
bun run cli:build
bun run release:check-cli-pack
bun run lint:fix
```

7. Report completion.
Summarize:

- new version
- changelog highlights
- files changed
- whether checks passed

8. Commit and push release changes first.

```bash
git add CHANGELOG.md apps/server/package.json packages/http-client/package.json \
  packages/cli/package.json apps/extension/package.json bun.lock
git commit -m "release: vX.Y.Z"
git push origin main
```

9. Publish gate (after push).
Never publish automatically. Ask for explicit approval before npm publish, and only publish after
the release commit is pushed to `origin/main`.

## Editing Rules

- Keep package versions synchronized: server, http-client, cli.
- Keep `@rankwrangler/http-client` dependency pinned to `^X.Y.Z` in CLI + extension.
- Keep `CHANGELOG.md` top release version equal to package versions.
