# AGENTS.md

This document guides AI coding assistants working in the RankWrangler Server repository.

## Overview

- **Repo layout**: Monorepo. The server lives in `apps/server`.
- **Runtime**: Fastify + TypeScript, bundled with Vite for Node 18.
- **Purpose**: Amazon SP-API façade that powers RankWrangler clients.
- **Entry point**: `apps/server/src/index.ts` (compiled to `apps/server/dist/index.js`).
- **Database**: PostgreSQL via Drizzle ORM. SQL migrations live in `apps/server/drizzle/`; `init.sql` seeds fresh stacks.
- **Environment**: Variables defined in `.env.example` (repo root) and validated in `apps/server/src/config/env.ts`. Local `.env` lives at repo root.
- **Paths**: `@/` alias maps to `apps/server/src/`.

## Commands

- `bun run build` – SSR build with Vite (run from `apps/server`).
- `bun run start` – runs the compiled server with `dotenv-cli` (run from `apps/server`).
- `docker compose up --build` – local stack with PostgreSQL (run from `apps/server`).
- `./test-api.sh` – curl-based smoke test for the main endpoints (run from `apps/server`).

### Monorepo Build Order (Important)

- The extension installs `@rankwrangler/http-client` from npm.
- If extension type-check/build fails with `TS2307: Cannot find module '@rankwrangler/http-client'`, install dependencies and retry:

```bash
bun install
bun run --filter rankwrangler-extension build
```

- Use this same order before running extension-only TypeScript checks in fresh environments.

## Deployment

### Build & Deploy

```bash
# Full rebuild and deploy
docker compose up -d --build

# Rebuild specific service
docker compose build --no-cache server
docker compose up -d server

# Just restart (no rebuild)
docker compose up -d
```

Run from `apps/server`, or from the repo root:

```bash
docker compose -f apps/server/compose.yml up -d --build
```

### Service Names

Docker Compose services vs container names:
- `server` → `rankwrangler-server`
- `caddy` → `rankwrangler-caddy`
- `postgres` → `rankwrangler-postgres`

### Checking Health

```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep rankwrangler

# Server logs
docker logs rankwrangler-server --tail 50

# Caddy logs
docker logs rankwrangler-caddy --tail 50
```

### Common Issues

1. **Server unhealthy after deploy** - Check logs for migration errors:
   ```bash
   docker logs rankwrangler-server 2>&1 | tail -30
   ```

2. **Cached Docker layers** - If code changes aren't reflected:
   ```bash
   docker compose build --no-cache server
   ```

## Production Database Access (Critical)

Use this workflow whenever you need to inspect or interact with the production
RankWrangler database.

### Safety Rules

- Treat production as **read-only by default**.
- Do not run `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`, or migrations
  without explicit user approval in the current conversation.
- Prefer bounded queries (`LIMIT`, explicit date windows) to avoid large scans.
- Do not print credentials in responses.

### Connection Workflow (Direct `psql`, Preferred)

Run from repo root:

```bash
# Load DB env vars from repo-root .env
set -a
source .env
set +a

# Enforce read-only at the session level
export PGOPTIONS='-c default_transaction_read_only=on'
export PGPASSWORD="$DATABASE_PASSWORD"

# Smoke-test connection
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c 'SELECT 1;'
```

Useful commands:

```bash
# List tables
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c '\dt'

# Describe a table
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c '\d products'

# Run a bounded query
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c \
  "SELECT marketplace_id, asin, last_fetched FROM products ORDER BY last_fetched DESC LIMIT 25;"
```

Interactive session:

```bash
psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME"
```

If you're running directly on the production host and want container-local access:

```bash
docker exec rankwrangler-postgres psql -U "$DATABASE_USER" -d "$DATABASE_NAME" -c 'SELECT 1;'
```

### Write Access Protocol (Only With Approval)

- Keep read-only mode on unless the user explicitly authorizes a write action.
- After approval, remove read-only guard for that command/session only:
  - `unset PGOPTIONS`
- Re-enable it immediately after:
  - `export PGOPTIONS='-c default_transaction_read_only=on'`

### Query References

- Detailed query playbook: `docs/database-queries.md`
- Schema source of truth: `apps/server/src/db/schema.ts`
- Migration SQL history: `apps/server/drizzle/`

## Environment Variable Management

### For Local Development
- Copy `.env.example` to `.env` in the repo root and populate values locally
- The `.env` file is git-ignored and never committed
- Use `bun run start` which loads the repo-root `.env` via `dotenv-cli`

### Adding New Environment Variables
1. Add to `apps/server/src/config/env.ts` with appropriate validation
2. Update `.env.example` (repo root) with a placeholder value

## Version Bump Protocol

When the user requests a version bump, follow this exact flow:

SemVer prompt policy:

- Do not proactively mention a SemVer bump for non-breaking API changes; the user will prompt.
- If a change is backward-incompatible, always call it out and suggest the SemVer bump.
- For `0.x.y` releases, treat breaking changes as a `minor` bump.
- For `1.x.y+` releases, treat breaking changes as a `major` bump.

1. Choose the SemVer bump level (patch/minor/major) based on change scope.
2. Sync the chosen version across these release surfaces (must stay in lockstep):
   - `apps/server/package.json`
   - `packages/http-client/package.json`
   - `packages/cli/package.json`
3. Update `CHANGELOG.md` with a new release section (`## vX.Y.Z - YYYY-MM-DD`) in the existing format.
4. Report completion and wait for explicit user approval before publishing.
5. Only after approval, publish npm packages in this order:
   - `@rankwrangler/http-client`
   - `@rankwrangler/cli`

Compatibility posture:

- Default to clean breaks for API/CLI evolution.
- Do not add legacy aliases, fallback code paths, compatibility shims, or dual-behavior migration
  logic unless explicitly requested.

## Expectations When Editing

1. Keep TypeScript strictness and Biome formatting intact (`biome.json` enforces 4-space indentation, single quotes, semicolons, 100-character lines).
2. **NEVER create migration files manually** - When schema changes are made, update `apps/server/src/db/schema.ts` and inform the user to run `bunx drizzle-kit generate` to create migrations. The user will always generate migrations themselves.
3. Update `apps/server/init.sql` whenever schema changes (after migrations are generated).
4. Document new behaviour in `README.md` and extend `test-api.sh` or add automated coverage for new endpoints.
5. Maintain executable flags on shell scripts (`chmod +x`).
6. Secrets stay out of version control—use `.env.production` for deployment overrides if needed.
7. **Keep startup status summary current** - When adding new services, jobs, or features, update the startup status summary in `apps/server/src/index.ts` to reflect the current state. This helps operators quickly verify the server is functioning correctly.
8. **Enforce file size limits** - Keep source files at **300 lines max** by default. React files should be especially small, focused, and composed from cohesive subcomponents/hooks. Any exception must be explicitly approved by the user in the current conversation before merging.

### PR Etiquette

- Before opening or merging a PR, review staged changes for accidental secrets (tokens, keys, passwords, private credentials) and remove them before commit.
- If a secret is committed, rotate/revoke it first, then remove it from git history.

## Reference

- Health endpoint: `GET /api/health`
- License management lives in `apps/server/src/services/license.ts`
- SP-API integration lives in `apps/server/src/services/spapi.ts`

## API Design

- **All APIs are tRPC** (no REST surface).
- Router structure:
  - `api.public.*` – public API (license key auth)
  - `api.app.*` – app/admin API (Clerk auth)
- Shared behavior should live in **utils/libs**, not shared routers.
  - Example: `apps/server/src/utils/product-info.ts` powers both public + app routes.
- Each tRPC procedure should live in its own file under `apps/server/src/api/public` or `apps/server/src/api/app`.

## Coding Style Guide

### General

1. **No `.js` extensions in imports** - TypeScript and the bundler handle resolution.
2. **Helper functions at bottom** - Put main exports first, implementation details below.
3. **No index re-exports** - Import directly from concrete files; avoid barrel files.
4. **kebab-case for files** - Use names like `theme-toggle.tsx`, not `ThemeToggle.tsx`.
5. **Const arrow function syntax** - Prefer `const fn = (...) => { ... }` over `function fn(...) { ... }`.

### TypeScript

1. **Rely on type inference** - Let tRPC, Drizzle, and Zod drive inferred types whenever possible.
2. **Minimal exports** - Export only what is consumed externally; avoid preemptive exports.
3. **No underscore-prefix convention** - Do not prefix unused/private identifiers with `_`.

### React Hooks (When React Is Involved)

1. **One hook export per file** - Keep each hook file focused and cohesive.
2. **Require defined arguments** - Components should guard `null`/`undefined` before calling hooks.
3. **Prefer simple local state for immediate UI feedback** - Avoid unnecessary complex cache mutation.
4. **Derive state inline** - Compute derived values in the hook body.
5. **Memoize `Date` query-key inputs** - Prevent avoidable refetch loops.
6. **Encapsulate query/effect wiring in hooks** - Keep components mostly presentational.

### Data Fetching (When Applicable)

1. **Prefer database/API-driven UI state** - Invalidate cached queries after successful writes.
2. **Synchronous flows** - Await server completion, then invalidate relevant queries.
3. **Background flows** - Use event-driven updates for async work not initiated by the caller.

## TypeScript Best Practices

- Build types first: define data models and function signatures before implementation.
- Make illegal states unrepresentable: prefer discriminated unions, branded types, and const assertions over loose optionals.
- Separate create/update/read shapes explicitly (`CreateX`, `UpdateX`, `X`).
- Keep modules small and focused; split files when responsibilities diverge or exceed ~200 lines.
- Prefer immutability: use `const`, `readonly`, `Readonly<T>`, and avoid mutating parameters.
- Favor functional patterns (`map/filter/reduce`) and isolate side effects.
- Keep strict typing on; use exhaustive `switch` with `never` checks for safety.
- Handle errors with context; never swallow exceptions silently.
- Handle edge cases explicitly (nulls, empty arrays, boundaries).
- Use `await` for async calls and add context to external errors.
- Add or update focused tests when behavior changes.
- Validate runtime inputs at boundaries; treat schemas as source of truth and infer types from them.
- Use `safeParse` for expected user input failures and `parse` at trusted boundaries.
- Validate configuration on startup; avoid scattered `process.env` usage.

## React Best Practices

- Apply the TypeScript best practices above to React code as well.
- Treat Effects as escape hatches; prefer render-time derivation and event handlers over Effects.
- Use Effects only to sync with external systems (browser APIs, subscriptions, non-React libraries).
- Avoid Effects for derived state, prop-change resets, or user-triggered actions; use `useMemo`, `key`, or event handlers instead.
- Never suppress `react-hooks/exhaustive-deps`; fix dependencies by using updater functions or moving objects/functions inside Effects.
- Always clean up subscriptions and listeners; account for React dev double-invocations by writing correct cleanup, not guard refs.
- Use refs only for values that don’t affect rendering; never read/write `ref.current` during render.
- Prefer controlled components; isolate side effects and keep components focused and small.
- Custom hooks share logic, not state; each hook call is independent.
### Typed HTTP Client (Public API)

- Package: `packages/http-client`
- Purpose: provide a typed client for the public API without forcing consumers to depend on tRPC directly.
- Build types:
  - `bun run http-client:types`
  - `bun run http-client:build`

### CLI (Upcoming)

- CLI should use the typed client (`@rankwrangler/http-client`) and the public API surface.
- Keep CLI surface aligned with `api.public.*` so there is one canonical public API.
- Do not add legacy CLI aliases or compatibility shims unless explicitly requested.

## Important Implementation Details

### Timezone Handling for BSR Rank History

**CRITICAL**: Amazon US marketplace (`ATVPDKIKX0DER`) uses Pacific timezone (America/Los_Angeles) for business day boundaries. When recording BSR ranks in `product_rank_history`, always use Pacific date, not UTC or server local time.

- Use `getPacificDateString()` from `apps/server/src/utils/date.ts` to get the current date in Pacific timezone
- This ensures ranks fetched at 11 PM PST on Jan 1st are recorded as Jan 1st (not Jan 2nd in UTC)
- The function automatically handles PST/PDT transitions
- Never use `new Date().toISOString().split('T')[0]` or similar UTC-based date extraction for rank history dates

This is essential for accurate time-series BSR tracking that aligns with Amazon's day boundaries.

### Product Cache and Rank History Interaction

**IMPORTANT**: Products are cached indefinitely, but rank history is date-based (Pacific day). To ensure fresh data for each new Pacific day:

- If a product exists in cache, check if rank history exists for **today's Pacific date**
- If rank history doesn't exist for today's Pacific date, treat as cache miss and fetch fresh data
- This ensures we always have rank data for the current Pacific day

Example: Product fetched at 11 PM PST on Jan 1st. A query at 1 AM PST on Jan 2nd will find the product in cache but no rank history for Jan 2nd, so it will fetch fresh data to populate today's ranks.

If unsure, ask for clarification instead of guessing—deployment touches live infrastructure.

## UI Components (coss ui)

- **Component library**: [coss ui](https://coss.com/ui) — copy-paste components built on [Base UI](https://base-ui.com/) and styled with Tailwind CSS.
- **Registry**: `https://coss.com/ui/llms.txt` lists all available components with doc links.
- **Component source**: Fetch `https://coss.com/ui/r/<component-name>.json` for the registry JSON containing full source code.
- **Local path**: `apps/website/src/components/ui/` — all UI components live here.
- **Adapting imports**: The coss registry uses `@base-ui/react`; this project uses `@base-ui-components/react`. Swap the import path when adding new components.
- **Always prefer coss ui components** over custom-styled elements. If a component is missing, fetch it from the registry and add it.

### Color Theme Hierarchy

Colors flow in one direction: **theme tokens → UI components → feature components**.

1. **`apps/website/src/styles/global.css`** defines all design tokens (CSS custom properties).
2. **`apps/website/src/components/ui/*`** consume tokens via Tailwind classes (`bg-primary`, `text-muted-foreground`, etc.).
3. **Feature components** use UI components by picking `variant` and `size` — never override colors with `bg-[#hex]` or `text-[#hex]` on UI components.

**Color scheme**: dark black + warm tan. The primary color is dark near-black (`--primary: #141210`), not green. Sage green is reserved for chart data visualization only.

Key token mappings:
- `bg-primary` / `text-primary-foreground` — dark buttons, active states
- `bg-background` — page/panel backgrounds (`#FCFCFC`)
- `text-foreground` — primary text (`#1C1917`)
- `text-muted-foreground` — secondary/subtle text (`#78716C`)
- `bg-accent` — light hover backgrounds
- `bg-secondary` — soft inactive backgrounds

**Never hardcode hex values** in feature components for colors that have theme tokens. If a color doesn't map to an existing token and is needed in multiple places, add a new token to `global.css` rather than scattering raw hex values.
