# UI Testing Workflow (Dev + agent-browser)

Use this workflow when browser testing is explicitly requested and you need to verify website UX/auth with a real browser session.

## When to Use

Run this when browser verification is requested for user-visible changes, including:
- UI layout/styling changes
- navigation and interaction changes
- auth/session behavior changes
- error/loading/empty-state changes

## Prerequisites

- Repo root `.env` is configured.
- `@rankwrangler/server` and `@rankwrangler/website` dependencies are installed.
- `agent-browser` is available (`agent-browser` or `npx agent-browser`).

For authenticated dashboard checks, either:
- sign in manually in the browser session, or
- enable dev auto sign-in:
  - `DEV_CLERK_SIGN_IN_USER_ID=<clerk_user_id>`
  - `VITE_DEV_CLERK_AUTO_SIGN_IN=true`

## Procedure

1. Start API and website dev servers in separate shells.

```bash
# Shell 1 (repo root)
bun run --filter @rankwrangler/server dev

# Shell 2 (repo root)
bun run --filter @rankwrangler/website dev
```

2. Open the app and take an initial snapshot.

```bash
agent-browser --session rankwrangler-smoke open http://localhost:5173
agent-browser --session rankwrangler-smoke wait --load networkidle
agent-browser --session rankwrangler-smoke snapshot -i
```

3. Exercise the changed paths.
   Re-snapshot after each significant navigation or DOM/state update.

```bash
agent-browser --session rankwrangler-smoke click @e1
agent-browser --session rankwrangler-smoke wait --load networkidle
agent-browser --session rankwrangler-smoke snapshot -i
```

4. Capture verification evidence.

```bash
agent-browser --session rankwrangler-smoke screenshot --annotate
```

5. Close the browser session.

```bash
agent-browser --session rankwrangler-smoke close
```

## Output to Include in Handoff

- Verified flows (what was clicked/validated).
- Current app URL used for verification.
- Screenshot path(s) from `agent-browser`.
- Any residual risks or untested edge cases.

## Troubleshooting

- If `agent-browser` is not on `PATH`, use `npx agent-browser ...`.
- If local ports are occupied, stop old dev processes and restart.
- If auth blocks verification, confirm Clerk env vars and use manual sign-in as fallback.
