---
summary: Defines the synchronized RankWrangler version bump, changelog, validation, commit, tag, and GitHub release workflow.
read_when:
  - preparing a RankWrangler version bump or release
  - updating release metadata, changelog entries, tags, or GitHub release notes
---

# Releases

The server, public HTTP client, and CLI share one `X.Y.Z`. The CLI and extension dependency on
`@rankwrangler/http-client` moves with that version. The website footer derives its version from
the server package.

## Version Bump

When the user says `do a version bump`, complete this workflow through publish unless they narrow
the request. If no bump type was supplied, ask for `patch`, `minor`, `major`, or an explicit
version.

```bash
bun run release:bump <patch|minor|major|X.Y.Z>
bun install
bun run release:collect-changelog-context
```

Add the new top-level `CHANGELOG.md` entry as `## vX.Y.Z - YYYY-MM-DD`. Use only the applicable
`Added`, `Changed`, and `Fixed` sections. Describe product outcomes rather than commit order, and
do not keep a persistent `Unreleased` section.

## Validate

```bash
bun run release:check
bun run cli:build
bun run release:check-cli-pack
bun run extension:build
```

Commit only the intended version, dependency, lockfile, and changelog changes. The annotated
`vX.Y.Z` tag is the canonical release boundary. Pushing it runs release integrity checks and
publishes the matching changelog entry as the GitHub release body.

Public npm packages publish after the release commit reaches `origin/main`; follow
[npm packages](npm-packages.md).

## Version Policy

- Do not proactively suggest a bump for ordinary backward-compatible changes.
- Call out incompatible changes. Recommend `minor` while the product is `0.x`, and `major` after
  `1.0`.
- Prefer clean breaks over compatibility aliases unless the user requests otherwise.
