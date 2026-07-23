---
summary: Defines bearer-token resolution and the license-authenticated public, Clerk app, and admin tRPC boundaries.
read_when:
  - changing authentication middleware, license usage, Clerk sessions, admin gating, or local sign-in automation
  - deciding which API surface should own a procedure
---

# Authentication

RankWrangler mounts tRPC at `/api` and uses one bearer-token slot with two credential types. Context
resolution first attempts a RankWrangler license; if that is not valid, it attempts Clerk JWT
verification.

## Procedure Boundaries

| Surface | Credential | Intended consumer |
| --- | --- | --- |
| `api.public.*` | RankWrangler license key | CLI, extension, typed client, and automation. |
| `api.app.*` | Clerk JWT | Authenticated dashboard. |
| Admin app procedures | Clerk JWT plus email in `ADMIN_EMAIL` | Operational dashboard controls. |

Public Product mutations consume license usage explicitly after authentication. Usage limits reset
at midnight UTC; a limit breach maps to tRPC `TOO_MANY_REQUESTS`. License status and validation own
their narrower accounting behavior.

The website obtains a Clerk token and sends it through the tRPC HTTP batch link. The published HTTP
client scopes its proxy to `api.public.*` and sends the configured license key. Authentication
belongs at the procedure boundary; shared Product and history services do not branch on caller
type.

## Admin Boundary

Admin status is derived from the verified Clerk email and the configured `ADMIN_EMAIL` set. Admin
procedures currently own job history, Keepa diagnostics, provider statistics, license management,
and manual Product facet classification. Hiding a dashboard route is not authorization.

## Local Automation

`api.public.dev.createClerkSignInToken` exists only for localhost automation. It requires
`DEV_CLERK_SIGN_IN_USER_ID`, is disabled in production, and returns a short-lived Clerk ticket. The
website's optional dev auto-sign-in consumes that path.

## Invariants

- API keys and Clerk tokens are bearer credentials and must not be logged.
- Public and app routers share services, not procedures.
- Admin authorization is enforced server-side.
- Realtime app authentication is target behavior until the WebSocket transport ships; see
  [Realtime events](realtime-events.md).
