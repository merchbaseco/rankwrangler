---
summary: Defines the production Chrome extension build inputs, permanent unpacked identity, Clerk origin, and live verification contract.
read_when:
  - building or loading the RankWrangler Chrome extension for centralized Clerk authentication
  - changing the Chrome manifest key, Sync Host, account route, or extension release checks
---

# Chrome extension release

RankWrangler Chrome uses the production Merchbase Clerk Sync Host for interactive sign-in. The
background service worker obtains a short-lived Clerk session token and sends it as the explicit
`Authorization: Bearer` header to `https://rankwrangler.merchbase.co/api`. The extension never
accepts, stores, displays, migrates, or falls back to `MERCHBASE_API_KEY` or a legacy RankWrangler
license key.

## Required build inputs

`bun run extension:build:chrome` is the production build. It loads the repository-root environment
and runs a shared auth preflight before any bundle is emitted; it fails when any required value is
absent or unsafe. A local `pk_test_` value is not a production configuration and is rejected.

| Variable | Production contract |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Explicit Clerk production `pk_live_` publishable key. It is public client configuration, not a secret. |
| `VITE_CLERK_SYNC_HOST` | Explicitly `https://clerk.merchbase.co`, the production Clerk Sync Host used for cookie/session synchronization. |
| `VITE_CLERK_ACCOUNT_URL` | Explicit verified HTTPS `merchbase.co` sign-in/account route opened by the popup. This navigation URL is deliberately separate from the Sync Host; do not rely on an implicit host-root fallback for release builds. |

The public key is safe to commit and no private derivation material is retained in this repository.
Never generate a replacement key for a routine build: a changed key creates a different Chrome
origin and breaks the Clerk allow-list and the stable unpacked identity.

The public key and ID are committed implementation constants. The build derives and checks
`hfoliiddbbblflnaakfggibiiphalbnc` from the source manifest key; there are no identity environment
overrides to keep synchronized.

For a production build, export the live Clerk value and the verified account route in the invoking
environment, then run:

```bash
export VITE_CLERK_PUBLISHABLE_KEY=<pk_live_publishable_key>
export VITE_CLERK_SYNC_HOST=https://clerk.merchbase.co
export VITE_CLERK_ACCOUNT_URL=<verified_https_merchbase_account_route>

bun run extension:test:auth
bun run extension:build:chrome
```

The artifact is `apps/extension/dist/`. The build does not read or embed `CLERK_SECRET_KEY`,
`CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, or `MERCHBASE_API_KEY`.

## Stable origin and Clerk configuration

The Chrome source manifest contains the permanent public key. Chrome derives the stable extension
ID `hfoliiddbbblflnaakfggibiiphalbnc` from its SHA-256 digest. Confirm the generated artifact
contains the expected key before loading it:

```bash
jq -e -s '.[0].key == .[1].key' apps/extension/dist/manifest.json apps/extension/manifest.json
```

In Chrome, `chrome://extensions` must show the same ID after **Load unpacked**. A build without a
manifest key has an ephemeral ID and is not a valid production verification artifact.

The Clerk production instance's browser-extension allowed-origin setting must include exactly:

```text
chrome-extension://hfoliiddbbblflnaakfggibiiphalbnc
```

Configure the same exact origin in the Clerk development instance only when testing a development
build. This is an operator-controlled Clerk setting; the build and this task do not mutate it.

The Clerk production Native API must also be enabled. The server's `CLERK_AUTHORIZED_PARTIES` must
contain all three production bearer-token parties, exactly as shown in the deployment environment
example:

```text
https://rankwrangler.merchbase.co,chrome-extension://hfoliiddbbblflnaakfggibiiphalbnc,https://clerk.merchbase.co
```

The first value authorizes the website/API origin, the second authorizes the stable Chrome
extension, and the third authorizes the Sync Host. Website and extension origins alone are
insufficient for Sync Host sessions and produce unauthorized API requests.

The manifest keeps `storage` and `cookies` for Clerk Sync Host state, `tabs` for the account page
and extension messaging, `scripting` for the existing debug control, and the existing Amazon,
RankWrangler API, and Sync Host host permissions. The server accepts the stable `chrome-extension://`
origin for CORS; Clerk still requires the exact origin above.

## Live verification checklist

Use a built and loaded extension; the mocked preview does not prove permissions or background auth.

1. Confirm the generated manifest key and Chrome ID match the values above.
2. From the popup, click **Sign in**. It opens `VITE_CLERK_ACCOUNT_URL`; complete interactive Clerk
   authentication there and return to the extension.
3. Confirm the popup changes from signed out to signed in. The background worker must obtain the
   current Clerk session token through the Chrome refresh path (`getToken({ skipCache: true })` when
   issuing or refreshing a token, with only a short-lived in-memory reuse before `exp`). It must not
   read extension storage for an API key.
4. Prove refresh beyond one token lifetime. Record a successful Amazon product/search request, wait
   at least 75 seconds (the current production Native API token lifetime is 60 seconds), then issue
   another request and several concurrent product requests if available. Every post-wait request
   must remain `200`, proving the worker did not replay an expired Sync Host token. Inspect only
   redacted `iss`/`azp`/`exp` metadata or request status when validating the refreshed JWT; never copy,
   log, or display the bearer token value.
5. Sign out or revoke access. Product and history calls must stop with the signed-out/unauthorized
   message; the popup must offer a retry/account action and must not show a raw token or server
   error.
6. Confirm an API daily-limit response is rendered as the usage-limit message and does not retry
   blindly. Confirm network failures are generic and do not expose request details.
7. Inspect the popup and extension storage surfaces: no license editor, license validation, legacy
   key, or suite API-key field exists. `MERCHBASE_API_KEY` remains a CLI-only environment variable.
8. If Safari is rebuilt, confirm its generated manifest has no Chrome `key`; Safari continues to use
   native OAuth Authorization Code + PKCE and Keychain storage.

This checklist is read-only with respect to Clerk and production data. Loading an unpacked build is
the supported personal verification path; no Web Store publication or Chrome identity migration is
part of this contract.
