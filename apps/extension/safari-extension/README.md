# RankWrangler Safari App

The Xcode wrapper packages the RankWrangler web extension for macOS and iOS Safari.

## Build

From `apps/extension`:

```bash
bun run build:safari
```

The script builds the web extension, replaces
`safari-extension/Shared (Extension)/Resources` with `dist`, cleans the macOS scheme, and builds
`rankwrangler.xcodeproj` using the `rankwrangler (macOS)` scheme.

Xcode must be installed, selected with `xcode-select`, and licensed. For signing or distribution,
open `rankwrangler.xcodeproj`, select the appropriate development team and bundle identifiers,
then archive the app in Xcode.

## Structure

- `Shared (App)` and `Shared (Extension)` contain cross-platform sources and packaged resources.
- `macOS (App)` and `macOS (Extension)` contain macOS-specific configuration.
- `iOS (App)` and `iOS (Extension)` contain iOS-specific configuration.

Do not edit copied files under `Shared (Extension)/Resources` as source. Change the web extension
under `apps/extension/src`, then rebuild.
