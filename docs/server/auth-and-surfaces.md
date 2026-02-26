# Auth And API Surfaces

## Authentication

- Public API: `Authorization: Bearer <licenseKey>`
- App API: `Authorization: Bearer <clerkJwt>`
- Admin API access is restricted by `ADMIN_EMAIL`

Required/important env vars:

- `CLERK_SECRET_KEY`
- `LICENSE_SECRET`
- `KEEPA_API_KEY` (optional, needed for Keepa history import endpoints)
- `ADMIN_EMAIL` (optional)
- `DEV_CLERK_SIGN_IN_USER_ID` (optional, local automation)
- `VITE_DEV_CLERK_AUTO_SIGN_IN` (optional website localhost auto-sign-in)

## Dev Clerk Sign-In Token (Optional)

Local automation helper: `api.public.dev.createClerkSignInToken`

Guardrails:

- Enabled only when `DEV_CLERK_SIGN_IN_USER_ID` is set
- Disabled in production (`NODE_ENV=production`)
- Allowed only from localhost hosts
- Ticket TTL is 60 seconds

## API Structure

tRPC router is mounted at `/api`:

- `api.public.*` (license key auth)
- `api.app.*` (Clerk auth)

Router layout:

- Procedures live in:
  - `apps/server/src/api/public/*`
  - `apps/server/src/api/app/*`
- Router files compose procedures only.

## Public Procedures

- `api.public.getProductHistory`
- `api.public.getProductInfo`
- `api.public.getProductInfoBatch`
- `api.public.license.validate`
- `api.public.license.status`

Product payload notes:

- `isMerchListing` is derived from merch-template bullet matching.
- For merch listings, `bullet1`/`bullet2` contain seller bullets after template stripping.

## App Procedures

- `api.app.adminStatus` (admin)
- `api.app.getAdminStats` (admin)
- `api.app.getProductInfo`
- `api.app.getKeepaStatus`
- `api.app.keepaLog` (admin)
- `api.app.jobExecutions` (admin)
- `api.app.getProductHistory`
- `api.app.loadProductHistory`
- `api.app.license.generate`
- `api.app.license.list`
- `api.app.license.details`
- `api.app.license.delete`
- `api.app.license.reset`

## Typed Client + CLI

- Public typed client: `packages/http-client`
- Regenerate public types/build after public-router changes:
  - `bun run http-client:types`
  - `bun run http-client:build`
- Publish workflow: `docs/http-client-spec.md`

CLI:

- Package: `@rankwrangler/cli`
- Resource-first command style (`products get`, `license status`)
- JSON envelope responses:
  - Success: `{"ok": true, "data": ...}`
  - Error: `{"ok": false, "error": {"code": "...", "message": "..."}}`
- Local config: `~/.rankwrangler/config.json`
- Default marketplace: `ATVPDKIKX0DER` (override with `--marketplace` / `-m`)
- CLI spec: `docs/cli-spec.md`
