---
summary: Defines lightweight real-browser verification for RankWrangler website and extension-facing changes.
read_when:
  - verifying a user-facing flow, navigation change, form, persisted state, or loading/error behavior
  - preparing completion evidence for a dashboard or extension feature
---

# UI Verification

Use a real browser for user-facing changes. Verify one actual happy path and the riskiest adjacent
state; do not turn every change into a broad manual regression pass.

## Website

1. Start the server and website with `bun run dev`, or run them in separate terminals.
2. Open the URL printed by Vite.
3. Authenticate manually, or configure the localhost-only development sign-in with
   `DEV_CLERK_SIGN_IN_USER_ID` and `VITE_DEV_CLERK_AUTO_SIGN_IN=true`.
4. Exercise the changed path and one meaningful loading, empty, error, or permission state.
5. Check the browser console and server output for related errors.
6. Remove any smoke data created by the check.

Do not infer that a loading spinner proves completion. Verify the resulting table, panel, toast,
URL, or persisted state that owns success.

## Extension

Use [Extension preview](extension-preview.md) for visual states. Use a built and loaded extension
when the change depends on browser permissions, background messaging, Amazon-page observation, or
content-script behavior.

## Handoff

Report the URL/surface, flows exercised, observed result, adjacent state checked, and anything not
verified.
