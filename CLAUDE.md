# CLAUDE.md

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
- `./scripts/commands.sh <cmd>` – production management helper (`logs`, `status`, `restart`, etc.).
- `./test-api.sh` – curl-based smoke test for the main endpoints.

## Deployment

- Docker image built from `./Dockerfile`, tagged `ghcr.io/merchbaseco/rankwrangler-server`.
- GitHub Actions workflow (`.github/workflows/deploy.yml`) handles build + push and orchestrates infrastructure rollout via `merchbase-infra`.
- Manual deploy scripts under `scripts/` remain for reference but exit early with guidance.

## Expectations When Editing

1. Keep TypeScript strictness and Biome formatting intact (`biome.json` enforces 4-space indentation, single quotes, semicolons, 100-character lines).
2. Update both Drizzle SQL migrations and `init.sql` whenever schema changes.
3. Document new behaviour in `README.md` and extend `test-api.sh` or add automated coverage for new endpoints.
4. Maintain executable flags on shell scripts (`chmod +x`).
5. Secrets stay out of version control—use `.env.production` for deployment overrides if needed.

## Reference

- Health endpoint: `GET /api/health`
- Catalog search: `POST /api/searchCatalog`
- License management lives in `src/services/license.ts`
- SP-API integration lives in `src/services/spapi.ts`

If unsure, ask for clarification instead of guessing—deployment touches live infrastructure.
