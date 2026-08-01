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

Safari authentication is native OAuth Authorization Code + PKCE. The web extension passes only
public OAuth configuration to the native handler; access and refresh tokens are stored in the
Keychain, and the background worker receives an access token only for the active request. Set the
`VITE_CLERK_OAUTH_*` variables from the repository `.env.example` before packaging. Chrome uses
Clerk Sync Host interactive authentication instead.

Xcode must be installed, selected with `xcode-select`, and licensed. For signing or distribution,
open `rankwrangler.xcodeproj`, select the appropriate development team and bundle identifiers,
then archive the app in Xcode.

## Structure

- `Shared (App)` and `Shared (Extension)` contain cross-platform sources and packaged resources.
- `macOS (App)` and `macOS (Extension)` contain macOS-specific configuration.
- `iOS (App)` and `iOS (Extension)` contain iOS-specific configuration.

Do not edit copied files under `Shared (Extension)/Resources` as source. Change the web extension
under `apps/extension/src`, then rebuild.
