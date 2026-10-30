---
summary: Defines lightweight real-browser verification for RankWrangler website and extension-facing changes.
read_when:
  - verifying a user-facing flow, navigation change, form, persisted state, or loading/error behavior
  - signing in to a local or cloud dashboard, or recovering when automatic development sign-in does not fire
  - preparing completion evidence for a dashboard or extension feature
---

# UI Verification

Use a real browser for user-facing changes. Verify one actual happy path and the riskiest adjacent
state; do not turn every change into a broad manual regression pass.

## Website

1. Fill the database with `bun run db:seed:dev` if it is empty. That command also grants the shared
   Dev Sign-In user access to this database; without it every `api.app.*` read returns
   `UNAUTHORIZED` and the dashboard looks empty rather than forbidden.
2. Start the server and website with `bun run dev`, or run them in separate terminals.
3. Open the website at its allocated `dev-port` URL. The explicit development
   runtime and local database grant sign in as the shared development principal.
   No provider ticket or browser authentication is needed.
4. Exercise the changed path and one meaningful loading, empty, error, or permission state.
5. Check the browser console and server output for related errors. A rejected `api.app` read prints
   `[Auth] <code> <path>` on the server.
6. Remove any smoke data created by the check.

### When development access is refused

Check the explicit development runtime, loopback database target, completed
migrations, and canonical development grant. The startup guard rejects an
ambiguous or remote target before migrations. A newer revocation must be
resolved deliberately rather than overwritten by seeding.

## Extension

Use [Extension preview](extension-preview.md) for visual states. Use a built and loaded extension
when the change depends on browser permissions, background messaging, Amazon-page observation, or
content-script behavior.

## Handoff

Report the URL/surface, flows exercised, observed result, adjacent state checked, and anything not
verified.
