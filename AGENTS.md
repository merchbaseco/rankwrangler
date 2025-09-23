# Repository Guidelines

## Project Structure & Module Organization
RankWrangler is a Yarn 4 monorepo. Core code lives under `apps/` (Fastify API in `apps/server`, React Ink CLI in `apps/cli`, and the Xcode wrapper in `apps/safari-extension`). Shared browser code resides in `packages/web-extension`; icons and static assets live in `packages/icons` and `/assets`. Automation helpers sit in `/scripts` and service-specific `/apps/*/scripts`. Database migrations and seeds are tracked in `apps/server/drizzle` alongside `init.sql`.

## Build, Test, and Development Commands
Run these from the repo root unless noted:
- `yarn build:server` – Vite build for the Fastify service orchestrated by Turbo.
- `yarn build:safari` – bundles the web extension, then packages the Safari wrapper.
- `yarn cli` – launches the Ink-based license management CLI in watch mode.
- `yarn lint` / `yarn format` – enforce Biome rules across all workspaces.
For workspace-specific flows:
- `yarn --cwd apps/server start` – boots the API with `.env`; migrations run on startup.
- `yarn --cwd packages/web-extension dev` – Vite dev server for the browser extension with Tailwind output.
- `yarn --cwd apps/safari-extension clean` – resets Xcode artifacts before rebuilding.

## Coding Style & Naming Conventions
Biome enforces 4-space indentation, single quotes, semicolons, 100-character lines, and LF endings (`biome.json`). Keep TypeScript strict mode and the `@/` path alias in sync across workspaces. Use kebab-case for scripts, camelCase for variables, PascalCase for React components, and suffix service modules with `*.service.ts`. Run `yarn format` before committing large rewrites.

## Testing Guidelines
Automated coverage is limited; add tests for any new API surface. Exercise the server endpoints with `apps/server/test-api.sh` after `yarn --cwd apps/server start`. Document manual verification steps in the relevant README until a proper suite (e.g., Vitest with Fastify inject) accompanies the change. Include sample payloads when touching SP-API integrations.

## Commit & Pull Request Guidelines
Follow the observed Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`) and keep each commit scoped to a single package when possible. Pull requests should outline business impact, list validation commands, link the tracking issue, and attach screenshots or CLI output for UX changes. Call out schema or environment updates and refresh docs/CHANGELOG entries when behavior shifts.

## Environment & Security Notes
Use Node ≥18 with Yarn 4 Plug'n'Play; install dependencies once at the root via `yarn install`. Secrets stay in `.env` files that are ignored—never commit SP-API credentials. Ship database tweaks with matching files in `apps/server/drizzle` and `init.sql`. Maintain executable bits on deployment scripts (`chmod +x scripts/*.sh`) and keep Docker compose configs in sync with server updates.
