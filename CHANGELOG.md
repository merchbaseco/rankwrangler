# Changelog

All notable changes to this project will be documented in this file.

## v0.2.3 - 2026-03-01

### Added

- Add CLI `products history` agent output for BSR and price metric series.
- Add dashboard logs page and event log pipeline with Keepa queue/poll visibility.
- Add tiered Keepa scheduling with improved enqueue metrics and status reporting.
- Add shared history chart usage across website and extension surfaces.
- Add extension UI preview workflow updates with safer placeholder license key handling.

### Changed

- Handle SP-API no-payload catalog responses as product deletions in sync flows.
- Refine event logging behavior, server documentation, and Keepa policy labeling.

### Fixed

- Fix product drawer chart skeleton height and sponsored carousel stats placement.
- Fix Caddy build wiring to include the history-chart workspace dependency.
- Improve dashboard log view layout behavior and readability.

## v0.2.2 - 2026-02-24

### Added

- Add dashboard-style BSR chart styling to the extension product view.
- Add Keepa stale sync tests and documentation coverage.

### Changed

- Add bottom border to the appearance settings section for stronger visual separation.
- Clarify agent guidance for work-in-progress rewrite expectations.

### Fixed

- Clarify history chart date labeling behavior.

## v0.2.1 - 2026-02-22

### Added

- Add fuzzy dashboard product search and stronger filter-driven sidebar workflows.
- Add extension BSR history graph flow, including history sheet deep-linking from BSR badges.
- Add admin job runtime observability, queue log browsing, and per-source drilldown stats.
- Add Keepa sync loading states and richer history date-range controls.

### Changed

- Move product ingest processing to an event-driven queue flow and align Keepa refresh to one-shot
  enqueue jobs.
- Rename ingest queue labeling to the SP-API sync queue across admin surfaces.
- Refine BSR/history chart interactions, sparse-range handling, and loading/empty-state behavior.
- Improve extension build prebuild dependency handling and dashboard/admin UI polish.
- Clarify docs for Keepa automatic vs manual behavior.

## v0.2.0 - 2026-02-20

### Added

- Add Keepa history import flow and dashboard history UI.
- Add Keepa refresh queue processing and Keepa status metrics in the dashboard.
- Add admin job runtime observability endpoints and dashboard visibility.
- Add extension BSR history modal with on-demand history loading flow.
- Add public + app product history query/load procedures for Keepa-backed BSR history.
- Add public API usage consumption to history query/load endpoints to enforce API key limits.

### Changed

- Align Keepa refresh behavior to a one-shot enqueue model.
- Redesign dashboard sidebar header/layout, Keepa history panel, filters, and settings modal UX.
- Standardize external naming to `API key` across public API routes, CLI commands, extension UI
  copy, and related docs.
- Rename CLI auth commands from `license status|validate` to `api-key status|validate`.
- Rename public API auth namespace from `api.public.license.*` to `api.public.apiKey.*` and app
  namespace from `api.app.license.*` to `api.app.apiKey.*`.
- Switch CLI environment fallback from `RR_LICENSE_KEY` to `RR_API_KEY`.

### Fixed

- Fix Keepa fetch worker job payload handling.

## v0.1.3 - 2026-02-17

### Changed

- Set `@rankwrangler/cli` to expose both `rw` (primary) and `rankwrangler` binaries.
- Tighten CLI help output into a concise man-style format and remove principles text from runtime
  help.
- Remove legacy CLI command and flag aliases by default (`get-product-info`,
  `get-product-info-batch`, `products get-batch`, `--licenseKey`, `--url`, `--marketplaceId`,
  `--asins`).
- Add explicit CLI policy guidance that legacy aliases/compatibility shims require explicit user
  direction.

## v0.1.2 - 2026-02-17

### Changed

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
