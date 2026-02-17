# Agent Notes

This document captures operator-specific instructions for coding agents.

## Version Bump Workflow

When asked to do a version bump:

1. Choose the correct SemVer increment (`patch`, `minor`, or `major`).
2. Keep versions synchronized across:
   - `apps/server/package.json`
   - `packages/http-client/package.json`
   - `packages/cli/package.json`
3. Update `CHANGELOG.md` with a new `vX.Y.Z` entry using the existing changelog style.
4. Confirm completion with the user and wait for explicit approval before publishing.
5. After approval, publish in order:
   - `@rankwrangler/http-client`
   - `@rankwrangler/cli`

## SemVer Prompt Policy

- Do not proactively mention SemVer bumps for non-breaking API changes.
- If a change is backward-incompatible, always mention it and suggest a SemVer bump.
- For `0.x.y`, recommend a `minor` bump for breaking changes.
- For `1.x.y+`, recommend a `major` bump for breaking changes.

## Compatibility Posture

- Prefer clean, intentional breaks over backward-compatibility layers.
- Do not add legacy aliases, fallback behaviors, compatibility shims, or migration paths unless
  explicitly requested.
