# Extension UI Preview

Use this workflow to preview extension UI surfaces locally without rebuilding and reloading
Chrome extension packages.

## Command

Run from repo root:

```bash
bun run preview:chrome
```

This starts Vite and opens:

- `/preview.html` served by `apps/extension`

## What This Preview Covers

- Popup surface states (loading, active, invalid, inactive)
- Content display states (loaded/no-rank/loading/error)
- Product history chart rendering
- Options page shell
- Install page shell

Main entry files:

- `apps/extension/preview.html`
- `apps/extension/src/scripts/preview/index.tsx`
- `apps/extension/src/scripts/preview/chrome-preview.tsx`

## Preview Runtime Shim

`preview:chrome` sets `VITE_PREVIEW_CHROME=true`, which enables a Vite alias in
`apps/extension/vite.config.ts`:

- `webextension-polyfill-ts` -> `src/scripts/preview/mock-webextension-polyfill.ts`

This prevents the browser-extension-only runtime from crashing in a regular browser tab.

## Keep It In Sync

When extension UI changes, update preview assets in the same PR:

1. If popup/content/options/install UI changes, update
   `src/scripts/preview/chrome-preview.tsx`.
2. If previewed components begin using new extension APIs, extend
   `src/scripts/preview/mock-webextension-polyfill.ts`.
3. Keep `apps/extension/package.json` script
   `preview:chrome: VITE_PREVIEW_CHROME=true vite --open /preview.html`.
4. Verify locally:
   - `bun run preview:chrome`
   - No `webextension-polyfill-ts` runtime error in console
   - No favicon 404 for preview page

## Notes

- `Download the React DevTools...` is a normal development message.
- Preview data is mocked/local and does not represent live extension runtime behavior.
