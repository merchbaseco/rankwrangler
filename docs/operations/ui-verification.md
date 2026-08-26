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
3. Open `http://localhost:5173`. Sign-in is automatic outside production — the page requests a
   short-lived Clerk ticket from `api.dev.createClerkSignInToken` and activates the session itself.
   Use `localhost`, not the LAN address: the authorized party the schema declares for development is
   `http://localhost:5173`.
4. Exercise the changed path and one meaningful loading, empty, error, or permission state.
5. Check the browser console and server output for related errors. A rejected `api.app` read prints
   `[Auth] <code> <path>` on the server.
6. Remove any smoke data created by the check.

### When auto sign-in does not fire

Confirm the server printed `Dev Clerk Sign-In Token: Configured (user_…)` at startup; if it says
disabled, the flow is off and the line names why. Otherwise mint and consume a ticket by hand:

```bash
curl -s -X POST http://localhost:8080/api/api.dev.createClerkSignInToken \
  -H 'Content-Type: application/json' -d '{"json":null}'
```

Open `http://localhost:5173/?__clerk_ticket=<ticket>` within sixty seconds. The ticket must be
consumed on the app origin, where Clerk's `<SignIn />` component picks it up. The Clerk Account
Portal's default redirect does not work for this instance, so a `*.accounts.dev` sign-in URL will
strand the ticket.

Do not infer that a loading spinner proves completion. Verify the resulting table, panel, toast,
URL, or persisted state that owns success.

## Extension

Use [Extension preview](extension-preview.md) for visual states. Use a built and loaded extension
when the change depends on browser permissions, background messaging, Amazon-page observation, or
content-script behavior.

## Handoff

Report the URL/surface, flows exercised, observed result, adjacent state checked, and anything not
verified.
