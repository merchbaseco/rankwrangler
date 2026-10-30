---
summary: Defines Cloudflare assertions, local Merchbase grants, client OAuth, and dashboard boundaries.
read_when:
  - changing authentication, admin access, local development, or client sign-in
  - diagnosing rejected dashboard, public API, MCP, or extension requests
---

# Authentication

Cloudflare Access authenticates requests. RankWrangler verifies its signed origin
assertion against the configured issuer and the application selected by the raw
request host. Bearer prefixes and forwarded-host headers never select dashboard
privileges.

- `rankwrangler.merchbase.co` accepts the interactive audience for the dashboard
  and its same-origin APIs. Exact MCP endpoint and protected-resource metadata
  paths on this host use the suite Managed OAuth audience instead.
- `rankwrangler-api.merchbase.co` accepts the suite Managed OAuth audience for
  customer keys, Chrome and Safari OAuth, CLI calls, and the MCP alias. Human
  OAuth cannot use dashboard or admin procedures.
- `rankwrangler-internal.merchbase.co/api/internal/access-snapshot` accepts only
  the configured authority service identity and receiver audience.

Unknown hosts and customer delegation headers fail closed. Liveness and OAuth
discovery retain exact public routes. Safari's association file and HTTPS
callback stay public; callback query values are excluded from access logs.

## Local grants and ownership

The shared Access package maps verified identities to stable Merchbase Users
through local aliases and a canonical grant. Their source revisions must match.
Credentials never create grants or change service-account ownership.

Cold identities may load one authenticated snapshot. Normal requests and jobs
read local state and expiry. The server reuses identity and grant lookups for up
to five minutes and forgets them on every projection write, so only an
out-of-process write waits that long; expiry is still checked per request.
Cloudflare signing keys are fetched at startup and refreshed in the background,
and fetched in line only for an unknown key id. Internal snapshots apply monotonically and close
affected dashboard connections. Daily repair refreshes known users. Denial
retains product data, metering, and connected provider credentials.

Dashboard WebSockets use the verified upgrade assertion. Their deadline is the
earlier of assertion and local grant expiry. Snapshot delivery closes existing
connections so changed grants are checked on reconnect. Connection parameters
contain no credentials.

## Clients

The dashboard uses same-origin cookies and Cloudflare's local logout endpoint.
Account and key management live at `merchbase.co/account`.

Chrome uses `identity.launchWebAuthFlow`, public dynamic registration, S256 PKCE,
state, and the permanent extension HTTPS callback. Renewable context stays in
storage restricted to trusted extension contexts. Refresh is serialized;
logout clears storage and revokes late rotated results. Content scripts never
receive renewable credentials. Safari keeps native OAuth and Keychain storage.

Public clients send opaque OAuth bearers to Cloudflare. Versioned `mbk_v1`
credentials from `MERCHBASE_API_KEY` or the common CLI keychain become native
Cloudflare client ID and secret headers. The public npm client has no private
package dependency.

## Development and release

An explicit development runtime uses the shared offline principal. Its target
guard runs before migrations and refuses remote databases or production
lifecycle markers. The projection adapter seeds the stable development user;
newer local revocation and expiry remain effective. No fake JWT or Clerk ticket
is needed.

These access changes use generated migration `0065_cloudflare_access.sql`. Cutover still requires
the final published shared package, Cloudflare configuration, matching Safari provisioning, and
live client proof.

## BidBeacon product lookup

Only `POST /api/api.public.product.getMany` on
`rankwrangler-internal.merchbase.co` accepts BidBeacon's own Cloudflare service
credential and `x-merchbase-user-id`. The origin verifies the RankWrangler
internal audience, exact BidBeacon client ID, canonical local user grant, and
writes a durable `access_delegation_audit` record before running the existing
metered public procedure. Audit failure denies the request. This identity is
`service_delegated` and cannot enter interactive or admin procedures.

The client uses the internal origin, native Cloudflare headers, and
`batch: false`; all other internal methods, paths, query strings, and tRPC
batches are rejected. Customer hosts continue to reject the delegation header.
