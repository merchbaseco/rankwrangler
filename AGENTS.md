# AGENTS.md

This document guides AI coding assistants working in the RankWrangler Server repository.

## Overview

- **Runtime**: Fastify + TypeScript, bundled with Vite for Node 18.
- **Purpose**: Amazon SP-API façade that powers RankWrangler clients.
- **Entry point**: `src/index.ts` (compiled to `dist/index.js`).
- **Database**: PostgreSQL via Drizzle ORM. SQL migrations live in `drizzle/`; `init.sql` seeds fresh stacks.
- **Environment**: Variables defined in `.env.example` and validated in `src/config/env.ts`.
- **Paths**: `@/` alias maps to `src/`.

## Commands

- `yarn build` – SSR build with Vite.
- `yarn start` – runs the compiled server with `dotenv-cli`.
- `docker compose up --build` – local stack with PostgreSQL.
- `./test-api.sh` – curl-based smoke test for the main endpoints.

## Environment Variable Management

### For Local Development
- Copy `.env.example` to `.env` and populate values locally
- The `.env` file is git-ignored and never committed
- Use `yarn start` which loads `.env` via `dotenv-cli`

### Adding New Environment Variables
1. Add to `src/config/env.ts` with appropriate validation
2. Update `.env.example` with a placeholder value

## Expectations When Editing

1. Keep TypeScript strictness and Biome formatting intact (`biome.json` enforces 4-space indentation, single quotes, semicolons, 100-character lines).
2. **NEVER create migration files manually** - When schema changes are made, update `src/db/schema.ts` and inform the user to run `yarn drizzle-kit generate` to create migrations. The user will always generate migrations themselves.
3. Update `init.sql` whenever schema changes (after migrations are generated).
4. Document new behaviour in `README.md` and extend `test-api.sh` or add automated coverage for new endpoints.
5. Maintain executable flags on shell scripts (`chmod +x`).
6. Secrets stay out of version control—use `.env.production` for deployment overrides if needed.
7. **Keep startup status summary current** - When adding new services, jobs, or features, update the startup status summary in `src/index.ts` to reflect the current state. This helps operators quickly verify the server is functioning correctly.

## Reference

- Health endpoint: `GET /api/health`
- License management lives in `src/services/license.ts`
- SP-API integration lives in `src/services/spapi.ts`

## Important Implementation Details

### Timezone Handling for BSR Rank History

**CRITICAL**: Amazon US marketplace (`ATVPDKIKX0DER`) uses Pacific timezone (America/Los_Angeles) for business day boundaries. When recording BSR ranks in `product_rank_history`, always use Pacific date, not UTC or server local time.

- Use `getPacificDateString()` from `src/utils/date.ts` to get the current date in Pacific timezone
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
