---
summary: Defines Chrome extension identity, Cloudflare Managed OAuth configuration, builds, and live verification.
read_when:
  - building or loading the RankWrangler Chrome extension
  - changing its manifest identity, OAuth callback, permissions, or release checks
---

# Chrome extension release

Chrome signs in with Cloudflare Managed OAuth using Authorization Code and S256
PKCE through `browser.identity.launchWebAuthFlow`. Its background worker sends
the opaque access token to `https://rankwrangler-api.merchbase.co` in the
Authorization header. Refresh credentials stay in trusted extension storage;
content scripts never receive them. The extension does not accept suite API keys
or old license keys.

## Build

Run from the repository root:

```bash
bun run extension:test:auth
bun run extension:build:chrome
```

The build validates the fixed Cloudflare issuer and permanent public manifest key
before emitting `apps/extension/dist/`. Public configuration is declared in
`.env.schema`; `VITE_MERCHBASE_ACCESS_ISSUER` must match
`https://thearcade.cloudflareaccess.com`. No Clerk or machine secret belongs in
the extension build.

The manifest public key fixes the Chrome ID to
`hfoliiddbbblflnaakfggibiiphalbnc`. Keep this identity across builds. Verify the
built key matches the source before loading it:

```bash
jq -e -s '.[0].key == .[1].key' apps/extension/dist/manifest.json apps/extension/manifest.json
```

## Provider and origin configuration

Allow this exact redirect in the suite API Access application's Managed OAuth
configuration:

```text
https://hfoliiddbbblflnaakfggibiiphalbnc.chromiumapp.org/oauth/callback
```

The API must accept the exact extension origin in its browser Origin/CORS
boundary. This permission does not replace signed assertion verification.
The manifest uses `identity` for the OAuth browser flow, `storage` and `alarms`
for credential lifecycle, and existing Amazon/debug permissions. It no longer
uses Clerk cookie synchronization.

## Live verification

Use an isolated Chrome profile and the built extension. Mocked previews do not
prove browser permissions or sign-in.

1. Confirm the loaded ID matches the permanent ID above.
2. Sign in from the popup and complete Cloudflare authorization. Confirm the
   popup becomes signed in and an authorized product request succeeds.
3. Exercise concurrent requests after one five-minute access-token lifetime.
   They must use a renewed credential and remain successful. Inspect statuses
   and redacted timing metadata only.
4. Restart Chrome and verify refresh from the stored credential context.
5. Sign out, then confirm product/history calls stop and trusted storage no
   longer contains the credential. Verify provider revocation separately.
6. Check denied access, usage-limit responses, and network failures show safe
   messages and do not retry indefinitely or expose tokens.

An unpacked build is the personal verification path; Web Store publication is a
separate release action. Safari uses its own native OAuth and Keychain flow;
follow [the wrapper guide](../../apps/extension/safari-extension/README.md) for
associated-domain signing and live verification.
