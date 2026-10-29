# RankWrangler Safari app

The Xcode wrapper packages the extension for macOS 14.4 and later. Its native
handler uses Cloudflare Managed OAuth with Authorization Code, S256 PKCE, and
an HTTPS callback claimed by AuthenticationServices.

## Build and test

Run the native behavior tests without credentials or network access:

```bash
bun run --cwd apps/extension test:safari:oauth
```

Run `bun run build:safari` from `apps/extension` to rebuild the web resources
and wrapper. Xcode must be selected and licensed. Do not edit generated web
resources under `Shared (Extension)/Resources`.

The public build configuration lives in the root `.env.schema`. Safari uses
`VITE_MERCHBASE_ACCESS_ISSUER`, `VITE_RANKWRANGLER_SAFARI_OAUTH_RESOURCE`, and
`VITE_RANKWRANGLER_SAFARI_OAUTH_REDIRECT_URI`. Native code accepts the configured
Merchbase origins only. Chrome authentication has a separate implementation.

## Enable the claimed HTTPS callback

The native callback is
`https://rankwrangler.merchbase.co/oauth/safari/callback`. The
native extension declares `webcredentials:rankwrangler.merchbase.co`. Its signed
application identifier must match the public AASA file at
`/.well-known/apple-app-site-association`.

Before production cutover:

1. Enable Associated Domains for the signing identities and install matching
   provisioning profiles. Verify the signed entitlements and identifier prefix.
2. Serve AASA as `application/json` over HTTPS, without a redirect or Access
   login gate.
3. Allow the exact HTTPS callback in Cloudflare Managed OAuth. Keep its fallback
   response outside the login gate, without analytics, query logging, or a code
   relay.
4. Run the signed wrapper in Safari and complete login, renewal, restart, and
   sign-out. An unsigned build does not prove the Apple association.

Only macOS targets are currently present in the Xcode project. The archived
`iOS` source folders are not distributed targets.

## Credential lifecycle

Native code discovers the protected resource and authorization server, then
registers a public client. Refresh tokens and their issuer, resource, client ID,
and endpoint context stay in the Keychain. Concurrent API requests share one
native refresh operation. The web background receives an access token for its
request and never receives a refresh token.

The native `signOut` message clears local credentials and revokes the provider
grant. A network failure during revocation is reported after local cleanup.
Changing the credential context invalidates the saved credential and requires
sign-in again. Existing Clerk credentials are not reused.
