# agent.md

This document guides AI coding assistants working in the RankWrangler Server repository.

## Overview

- **Runtime**: Fastify + TypeScript, bundled with Vite for Node 18.
- **Purpose**: Amazon SP-API façade that powers RankWrangler clients.
- **Entry point**: `src/index.ts` (compiled to `dist/index.js`).
- **Database**: PostgreSQL via Drizzle ORM. SQL migrations live in `drizzle/`; `init.sql` seeds fresh stacks.
- **Environment**: Variables defined in `.env.example` and validated in `src/config/env.ts`. See "Environment Variable Management" section below.
- **Paths**: `@/` alias maps to `src/`.

## Commands

- `yarn build` – SSR build with Vite.
- `yarn start` – runs the compiled server with `dotenv-cli`.
- `docker compose up --build` – local stack with PostgreSQL.
- `./scripts/commands.sh <cmd>` – production management helper (`logs`, `status`, `restart`, etc.).
- `./test-api.sh` – curl-based smoke test for the main endpoints.

## Deployment

- Docker image built from `./Dockerfile`, tagged `ghcr.io/merchbaseco/rankwrangler-server`.
- GitHub Actions workflow (`.github/workflows/deploy.yml`) handles:
  - Build and push of server image to GHCR
  - Pulling latest infra repo changes
  - Authenticating Docker to GHCR using `GHCR_USERNAME` and `GHCR_TOKEN` secrets
  - Running `deploy.sh` which pulls all images and starts services
  - Updating server-level Caddy configuration if changed
- Infra changes: Add new services to `stack/rankwrangler/docker-compose.yml` in the infra repo. The deployment workflow automatically pulls and starts them.
- Manual deploy scripts under `scripts/` remain for reference but exit early with guidance.

## Environment Variable Management

**IMPORTANT**: Environment variables are managed through GitHub repository secrets, not local `.env` files in production.

### For Local Development
- Copy `.env.example` to `.env` and populate values locally
- The `.env` file is git-ignored and never committed
- Use `yarn start` which loads `.env` via `dotenv-cli`

### For Production Deployment
- **Canonical source**: GitHub repository secrets (Settings → Secrets and variables → Actions)
- Secrets are named with `RANKWRANGLER_` prefix (e.g., `RANKWRANGLER_POSTHOG_API_KEY`)
- The deployment workflow (`.github/workflows/deploy.yml`) automatically:
  1. Reads secrets from GitHub Actions
  2. Creates a `stack.env` file with the values
  3. Uploads it to the server as `stack/rankwrangler/.env`
  4. The `.env` file is then used by Docker Compose via `env_file: - .env`

### Adding New Environment Variables

When adding a new environment variable:

1. **Update the code**:
   - Add to `src/config/env.ts` with appropriate validation
   - Update `.env.example` with a placeholder value

2. **Update the deployment workflow** (`.github/workflows/deploy.yml`):
   - Add to the `env:` section: `VAR_NAME: ${{ secrets.RANKWRANGLER_VAR_NAME }}`
   - Add to the Python script's `keys` list
   - Add to the step's `env:` section

3. **Update documentation**:
   - Add to `DEPLOYMENT.md` in the "Runtime Secrets" section
   - Update `infra/stack/rankwrangler/deploy.sh` if needed (for consistency)

4. **Add the GitHub secret**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add `RANKWRANGLER_VAR_NAME` with the actual value
   - The next deployment will automatically include it

**Note**: The server's `.env` file is managed by the deployment workflow and should not be edited manually. All changes go through GitHub secrets and the deployment process.

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

### Cache TTL and Rank History Interaction

**IMPORTANT**: The product TTL (`expiresAt`) is time-based (12 hours from fetch), but rank history is date-based (Pacific day). To ensure fresh data for each new Pacific day:

- If a product exists and is not expired, check if rank history exists for **today's Pacific date**
- If rank history doesn't exist for today's Pacific date, treat as cache miss and fetch fresh data
- This ensures we always have rank data for the current Pacific day, even if the product entry hasn't expired yet

Example: Product fetched at 11 PM PST on Jan 1st expires at 11 AM PST on Jan 2nd. A query at 1 AM PST on Jan 2nd will find the product valid but no rank history for Jan 2nd, so it will fetch fresh data to populate today's ranks.

If unsure, ask for clarification instead of guessing—deployment touches live infrastructure.
