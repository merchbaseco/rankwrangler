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
- **Environment**: Pure front-end, no secret environment files in repo.

## Core Commands

- `bun run dev` – Vite dev server (Chrome/Firefox builds).
- `bun run build` – Full build (background, popup, content) outputs to `dist/`.
- `bun run build:safari` – Runs `scripts/build-safari.js` to rebuild the extension and Xcode project. Uses `dist/`.
- `bun run build:chrome` – Runs `scripts/build-chrome.js` to build Chrome extension. Uses `dist/`.
- `bun run tailwind` – Regenerate extension styles.
- `bun run lint` / `bun run lint:fix` – Biome checks and autofixes.
- `bunx tsc --noEmit` – Type-check the entire project.

> Run commands from `apps/extension`, or from the repo root using `bun --filter rankwrangler-extension`.

## Build Prerequisites (Workspace Dependency)

- `rankwrangler-extension` imports `@rankwrangler/http-client` from `packages/http-client`.
- In fresh clones/workspaces, build that package first from repo root before extension type-check/build:

```bash
bun run http-client:build
bun --filter rankwrangler-extension run build
```

- If you see `TS2307: Cannot find module '@rankwrangler/http-client'` during extension `tsc`, run the command above and retry.

## Architecture Notes

### Component Patterns
- File names use kebab-case (`search-badge.tsx`), components use PascalCase.
- UI primitives live under `src/components/ui`.
- Popup and content script share license helpers in `src/scripts/**/*.`

### License Display
- Unlimited plans detected by `licenseData.dailyLimit === -1`.
- Popup shows “X (Unlimited)” vs “X/Y” usage and renders badges accordingly.
- Components degrade gracefully when license data is missing or validation is pending.

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
  1. Runs `bun run build` (cleans and builds to `dist/`).
  2. Extension ready in `dist/` for loading as unpacked extension.
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

Ask for clarification before altering production endpoints or license logic.
