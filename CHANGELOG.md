# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## v0.1.2 - 2026-02-17

### Changed

- Sync all workspace package versions to `0.1.2` (`apps/server`, `apps/website`,
  `apps/extension`, `apps/extension/safari-extension`, `packages/http-client`,
  `packages/cli`).
- Sync CLI and typed HTTP client package versions to `0.1.2`.
- Update extension's pinned HTTP client tarball dependency to
  `rankwrangler-http-client-0.1.2.tgz`.
- Update release docs to require synchronized versions between `CHANGELOG.md` releases and npm
  packages.

## v0.1.0 - 2026-02-16

### Added

- Add public batch product endpoint (`api.public.getProductInfoBatch`) to support multi-ASIN workflows.
- Add CLI multi-ASIN product lookup (`products get <asin...>`) with default marketplace config and per-command override (`--marketplace` / `-m`).
- Add public license usage endpoints used by CLI/public HTTP clients for status and consume flows.

### Changed

- Rename and standardize the typed npm client package to `@merchbase/rankwrangler-http-client`.
- Set initial HTTP client package release to `0.1.0` in `packages/http-client/package.json`.
- Document npm publish and versioning policy for the typed HTTP client in `docs/http-client-spec.md`.
