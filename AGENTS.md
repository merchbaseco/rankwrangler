# Repository Guidelines

## Project Structure & Module Organization
This repository now hosts only the RankWrangler server. Source lives under `src/`, database artifacts in `drizzle/`, and deployment helpers in `scripts/`. Environment templates (`.env.example`, `.env.production`) sit at the project root alongside Docker and Compose files.

## Build, Test, and Development Commands
- `yarn build` – Vite bundle targeting Node 18.
- `yarn start` – run the compiled server with `dotenv-cli`.
- `docker compose up --build` – spin up the local stack using the provided compose file.
- `./test-api.sh` – manual smoke test against the local API.

## Coding Style & Naming Conventions
Biome enforces 4-space indentation, single quotes, semicolons, 100-character lines, and LF endings (`biome.json`). Keep TypeScript strict mode enabled and preserve the `@/` alias pointing at `src/`.

## Testing Guidelines
Add automated coverage for any new endpoint or infrastructure surface. Until a full suite exists, document manual verification steps in `README.md` and extend `test-api.sh` with representative payloads.

## Commit & Pull Request Guidelines
Use Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`). Call out schema changes, new environment variables, and updated deployment steps. Attach logs or curl output when modifying API behaviour.

## Environment & Security Notes
Run on Node ≥18 with Yarn 4 (Corepack). Keep secrets in `.env` files—never commit production credentials. Ship database changes with matching SQL in `drizzle/` and `init.sql`. Deployment scripts under `scripts/` must remain executable.
