# AGENTS.md

Always-on guidance for coding agents in the RankWrangler monorepo.

## Architecture Quick Map

- Monorepo with server in `apps/server`.
- Server runtime: Fastify + TypeScript (Node 18, Vite build).
- Entry point: `apps/server/src/index.ts`.
- Database: PostgreSQL + Drizzle.
- Schema source of truth: `apps/server/src/db/schema.ts`.
- SQL migrations: `apps/server/drizzle/`.
- Fresh-stack bootstrap SQL: `apps/server/init.sql`.
- Environment validation: `apps/server/src/config/env.ts`.
- Path alias: `@/` -> `apps/server/src/`.

## Always-On Rules

1. Keep TypeScript strictness and Biome formatting intact (`biome.json`: 4 spaces, single quotes, semicolons, 100-char lines).
2. Do not create migration files manually. Update `schema.ts`, then ask the user to run `bunx drizzle-kit generate`.
3. When schema changes are generated, keep `apps/server/init.sql` in sync.
4. Keep source files at 300 lines max unless the user explicitly approves an exception.
5. Update `README.md` and tests (`test-api.sh` and/or automated tests) when behavior changes.
6. Keep shell scripts executable (`chmod +x`).
7. Keep startup status summary in `apps/server/src/index.ts` current when adding jobs/services.
8. Never commit secrets. If a secret is exposed in git, rotate/revoke before history cleanup.

## API + Code Design

- All APIs are tRPC only (no REST surface).
- Router split:
  - `api.public.*`: license-key auth.
  - `api.app.*`: Clerk auth.
- Keep shared behavior in utils/libs (not shared routers).
- Each tRPC procedure should live in its own file under `apps/server/src/api/public` or `apps/server/src/api/app`.
- No `.js` import extensions.
- No barrel/index re-exports.
- Use kebab-case filenames.
- Prefer `const` arrow functions.
- Put helper functions at the bottom of files.

## Detailed Coding Standards

### Import And File Conventions

- Do not use `.js` extensions in TypeScript imports.
- Avoid barrel files (`index.ts` re-exports). Import from concrete files.
- Use kebab-case filenames.
- Export only what is consumed externally.
- Prefer `const` arrow functions over `function` declarations for standard helpers.
- Put helper functions below main exports.

### TypeScript Patterns

- Prefer type inference from tRPC, Drizzle, and Zod where clear.
- Design types first: model create/update/read shapes explicitly.
- Make illegal states unrepresentable (discriminated unions, const assertions).
- Use immutable patterns (`const`, `readonly`, `Readonly<T>`).
- Use exhaustive `switch` checks with `never` for branch safety.
- Validate runtime boundaries with schemas.
- Use `safeParse` for expected user input failures and `parse` at trusted boundaries.
- Add contextual error handling; do not swallow exceptions.

### React And Hooks

- Keep hook files focused (one hook export per file when practical).
- Guard nullable inputs before calling hooks.
- Prefer render-time derivation over effect-based derived state.
- Use Effects only for external synchronization (subscriptions, browser APIs, non-React libs).
- Do not suppress `react-hooks/exhaustive-deps`; fix dependency design instead.
- Keep components presentational by moving query/effect wiring into hooks.
- Prefer controlled inputs and explicit event-driven updates.

### Data Fetching

- Prefer server/database as source of truth.
- Await writes, then invalidate relevant queries.
- Use event-driven/background updates only for async work not initiated by the caller.
- Memoize `Date` inputs in query keys to avoid refetch loops.

### UI Component Rules (Website)

- Prefer coss ui components before custom-styled elements.
- coss registry: `https://coss.com/ui/llms.txt`
- Component source format: `https://coss.com/ui/r/<component-name>.json`
- Local component path: `apps/website/src/components/ui/`
- coss snippets use `@base-ui/react`; this repo uses `@base-ui-components/react`.
- Use theme token flow: `global.css` tokens -> `components/ui/*` -> feature components.
- Feature components should not hardcode hex colors when a token exists.
- Primary theme is dark near-black (`--primary: #141210`); reserve sage green for chart data.
- If a reusable color is missing, add a token to `global.css`.

## Critical Domain Invariants

### BSR date boundaries (US marketplace)

- Use Pacific day boundaries (`America/Los_Angeles`) for `product_rank_history` date keys.
- Always use `getPacificDateString()` from `apps/server/src/utils/date.ts`.
- Never use UTC date extraction like `new Date().toISOString().split('T')[0]` for rank history dates.

### Product cache vs daily rank history

- Product cache can exist indefinitely.
- Rank history must contain an entry for **today's Pacific date**.
- If product cache exists but today's Pacific rank record is missing, fetch fresh data and treat it as a cache miss for rank capture.

## Process Playbook Index

Open these only when the task needs that specific workflow:

- Local/dev commands, env setup, extension build order, deployment: `docs/operations-runbook.md`
- Production DB access and safety workflow: `docs/database-queries.md`
- Release/version bump/publish workflow: `docs/release-runbook.md`
- Browser verification workflow (when requested): `docs/ui-testing-workflow.md`
- Keepa refresh system behavior: `docs/keepa-history-refresh.md`
- Public typed client reference: `docs/http-client-spec.md`
- CLI behavior and release expectations: `docs/cli-spec.md`

## Maintenance Boundary

- Put guidance in `AGENTS.md` if it should influence agent behavior on nearly every turn (coding standards, architecture constraints, safety invariants, and default engineering expectations).
- Put guidance in `docs/*` if it is situational workflow/reference material used only for specific tasks (deploys, release steps, DB runbooks, one-off operational playbooks).
