---
summary: Defines centralized Merchbase bearer-token resolution, Clerk projections, metering, and admin tRPC boundaries.
read_when:
  - changing authentication middleware, centralized usage, Clerk sessions, admin gating, or local sign-in automation
  - diagnosing UNAUTHORIZED api.app calls, a missing local Access Projection, or the Clerk issuer a lifecycle authenticates against
  - deciding which API surface should own a procedure
---

# Authentication

RankWrangler mounts tRPC at `/api` and uses one bearer-token slot. Credentials are authenticated by
`@merchbaseco/access`, then resolved through a local Access Projection and the fixed `rankwrangler`
Service Account. A missing projection is cold-loaded from Clerk; webhook events keep the projection
and API-key cache current, and the daily repair job refreshes every explicitly mapped Service
Account.

Clerk OAuth JWTs are suite-wide credentials and do not contain a protected-resource audience.
RankWrangler does not request or verify an OAuth audience; the fixed service name and local Access
Projection are the product authorization boundary.

## Procedure Boundaries

| Surface | Credential | Intended consumer |
| --- | --- | --- |
| `api.public.*` | Merchbase API key, OAuth bearer, or extension Clerk session | CLI, typed client, automation, and extension data calls. |
| `api.app.*` | Clerk JWT | Authenticated dashboard. |
| Admin app procedures | Clerk session plus configured Merchbase User id | Operational dashboard controls. |

Public Product reads, Product history work, and Catalog-search work debit the mapped Service Account
atomically. Lifetime usage, daily usage, daily limit, reset time, and last-use time all live on that
account; limits reset at midnight UTC and a breach maps to tRPC `TOO_MANY_REQUESTS`. Catalog search
debits before durable external work is dispatched, so cached and joined work is not charged twice.

The website obtains a Clerk session token and sends it through the tRPC HTTP batch link. Its
subscription transport sends the same token in WebSocket connection parameters; the server verifies
it before allowing Product-history and Catalog-search app subscriptions, then closes the connection
when that verified credential expires. The published HTTP client scopes its proxy to `api.public.*`
and sends a Merchbase API key or explicit Authorization header. Authentication belongs at the
procedure boundary; shared Product and history services do not branch on caller type.

## Admin Boundary

Admin status is derived from the verified stable Merchbase User id and `RANKWRANGLER_ADMIN_MERCHBASE_USER_ID`.
Admin procedures own job history, Keepa diagnostics, provider statistics, and manual Product facet
classification. Hiding a dashboard route is not authorization.

## Local Automation

`api.dev.createClerkSignInToken` exists only for localhost automation. It requires
`RANKWRANGLER_DEV_CLERK_SIGN_IN_USER_ID`, is disabled in production, and returns a short-lived Clerk
ticket. The website's dev auto-sign-in consumes that path and is on outside production, so a fresh
worktree or cloud VM opens on the dashboard rather than a sign-in form. See
[UI verification](../operations/ui-verification.md) for the manual fallback.

Two things have to line up for that session to be worth anything, and both used to be wrong.

**The issuer is per-instance.** `createClerkAuthenticator` rejects any credential whose `iss` is not
byte-equal to `MERCHBASE_CLERK_ISSUER`, and development authenticates against the Clerk development
instance, not the production one. The schema resolves the development instance's own
`*.clerk.accounts.dev` origin outside production. Pointing development at
`https://clerk.merchbase.co` fails every `api.app.*` call with `UNAUTHORIZED` while the credentials
themselves are perfectly valid — the symptom looks like a data problem and is not one.

**The projection has to exist locally.** Authorization is decided against the Access Projection in
this database, and a development database receives no Clerk webhooks, so a freshly migrated one
grants nobody anything. `bun run db:seed:dev` calls `bootstrapDevAccessProjection` from
`@merchbaseco/access/dev`, which writes the projection the webhook would have written through the
same `AccessProjectionStore.apply` the webhook handler uses. There is no projection SQL in this
repository outside that store, and no override: the bootstrap refuses production, a non-loopback
database, and the production issuer. Its event claims the development Clerk User's creation instant
as `sourceUpdatedAt`, which is older than any real Clerk `updated_at`, so a real webhook or cold
load always wins and the bootstrap can never mask a revocation.

If the bootstrap raises `DevAccessBootstrapError` saying a newer event already owns the subject, the
local projection is ahead of the bootstrap. Delete this database's Access Projection rows and seed
again:

```sql
DELETE FROM access_projection_event;
DELETE FROM access_projection;
```

## Observability

`api.app.*` credential rejections are logged as one `[Auth] <code> <path>` line, with the
`ServiceAccessError` code when there is one. Fastify runs with `logger: false`, so without that line
a rejected dashboard read left no server-side trace at all. Bearer credentials and request headers
are never part of it.

## Invariants

- API keys, OAuth tokens, and Clerk session tokens are bearer credentials and must not be logged.
- Chrome uses Clerk Sync Host interactive authentication. Safari uses native Authorization Code +
  PKCE and Keychain storage; the extension never stores a suite API key.
- Background user-owned work evaluates the owner's current projection once at job start. Denied
  access completes safely; unavailable access releases work for retry.
- Final legacy cleanup is gated by one approved mapping per legacy license, plan digests, backup
  fingerprints, preservation proofs, and operator approval. Migration `0028` refuses to drop
  `licenses` without that gate.
- Public and app routers share services, not procedures.
- Admin authorization is enforced server-side.
- Realtime app procedures require Clerk authentication; see
  [Realtime events](realtime-events.md).
