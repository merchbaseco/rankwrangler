# Agent Guide – RankWrangler Extension

Use this document when assisting with the browser extension + Safari wrapper repository.

## Overview

- **Packages**: Vite + React + Tailwind for Chrome/Firefox builds; Safari app wrapper in `safari-extension/`.
- **Output**: All builds output to `dist/`. Each build cleans `dist/` before building.
  - Chrome: Extension ready in `dist/` for loading unpacked
  - Safari: `dist/` copied into `safari-extension/Shared (Extension)/Resources` for macOS/iOS
- **Entry points**:
  - Content script – `src/scripts/content/index.tsx`
  - Popup – `src/scripts/popup/index.tsx`
  - Background/service worker – `src/scripts/service-worker/service-worker.ts`
- **Environment**: Pure front-end. Chrome build inputs come from the repository-root `.env`; only
  `VITE_` values are bundled, and production Chrome builds reject development Clerk keys.

## Core Commands

- `bun run dev` – Vite dev server (Chrome/Firefox builds).
- `bun run build` – Full build (background, popup, content) outputs to `dist/`.
- `bun run build:safari` – Runs `scripts/build-safari.js` to rebuild the extension and Xcode project. Uses `dist/`.
- `bun run build:chrome` – Runs the production Chrome build preflight and writes the extension to `dist/`.
- `bun run test:auth` – Verifies the permanent Chrome public key/ID and production auth preflight.
- `bun run preview:chrome` – Opens local UI preview page with extension surfaces (no extension reload loop).
- `bun run tailwind` – Regenerate extension styles.
- `bun run lint` / `bun run lint:fix` – Biome checks and autofixes.
- `bunx tsc --noEmit` – Type-check the entire project.

> Run commands from `apps/extension`, or from the repo root using `bun --filter rankwrangler-extension`.

## Build Prerequisites (NPM Dependency)

- `rankwrangler-extension` installs `@rankwrangler/http-client` from npm.
- In fresh clones/workspaces, install dependencies before extension type-check/build:

```bash
bun install
bun run --filter rankwrangler-extension build
```

- If you see `TS2307: Cannot find module '@rankwrangler/http-client'` during extension `tsc`, run `bun install` and retry.

## UI Preview Maintenance

- Canonical workflow doc: `../../docs/operations/extension-preview.md`
- When popup/content/options/install UI changes, update preview surfaces in the same PR.

## Architecture Notes

### Component Patterns
- File names use kebab-case (`search-badge.tsx`), components use PascalCase.
- UI primitives live under `src/components/ui`.
- Popup and content script share centralized-auth helpers in `src/scripts/**/*.`
- Chrome delegates interactive auth to the Clerk Sync Host; Safari delegates OAuth to the native
  handler. Neither path stores a suite API key in extension storage.
- Chrome's committed public CRX key derives to `hfoliiddbbblflnaakfggibiiphalbnc`. Keep that key
  unchanged for unpacked builds; the production build preflight rejects a changed key or ID.

### Content Script Behaviour
- Mutation observers in `src/scripts/content/app.tsx` watch Amazon result pages.
- `SearchInjector` (in `content/services/search-injector.ts`) manages element mounting and cleanup.
- Each badge renders in a shadow root to isolate styles from Amazon’s CSS.
- IndexedDB caches product data (`db/product-cache.ts`) and request throttling uses `limiter`.
- Navigation handler listens for `pagehide/pageshow` to reset state across back/forward cache.

### Performance
- FIFO processing prioritises visible listings.
- Skeleton placeholders avoid layout shifts.
- Request rate limited to 20/s to respect API constraints.

## Safari Wrapper

- Wrapper lives in `safari-extension/`.
- `bun run build:safari`:
  1. Runs `bun run build` (cleans and builds to `dist/`).
  2. Copies `dist/` into `safari-extension/Shared (Extension)/Resources`.
  3. Executes `xcodebuild` for the macOS scheme.
- `safari-extension/package.json` also exposes `clean` and `uninstall` utilities.

## Chrome Build

- `bun run build:chrome`:
  1. Requires an explicit production `pk_live_` Clerk publishable key, the production Sync Host,
     and the explicit Merchbase account URL.
  2. Runs `bun run build --mode production` (cleans and builds to `dist/`).
  3. Extension ready in `dist/` for loading as unpacked extension.

See [`docs/operations/extension-release.md`](../../docs/operations/extension-release.md) for the
stable Chrome origin, Clerk allowed-origin, and live verification contract.
- To test in Chrome:
  1. Open `chrome://extensions`
  2. Enable "Developer mode"
  3. Click "Load unpacked" and select `dist/` directory

## Editing Expectations

1. Keep Tailwind configuration (`tailwind.config.ts`) and PostCSS flows intact.
2. Maintain alias resolution for `@` → `src`.
3. Update docs (`README.md`, if added) when changing build flows.
4. Avoid committing derived `dist/` output unless explicitly required.
5. When touching Safari resources, ensure both iOS and macOS targets still compile.

Ask for clarification before altering production endpoints or centralized-auth contracts.
