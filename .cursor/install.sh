#!/usr/bin/env bash
# Idempotent repository bootstrap for RankWrangler Cloud Agents.
# Runs after the source tree is checked out. Installs workspace dependencies
# and materializes a local `.env` for host-run development.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# Install Bun workspace dependencies. Requires MERCHBASE_GITHUB_NPM_TOKEN in the
# environment so the private @merchbaseco scope resolves from GitHub Packages.
if [ -z "${MERCHBASE_GITHUB_NPM_TOKEN:-}" ]; then
    echo "[install] WARNING: MERCHBASE_GITHUB_NPM_TOKEN is not set; the private" \
        "@merchbaseco/access package cannot be fetched from GitHub Packages." >&2
fi
bun install --frozen-lockfile

# Materialize a local .env for host-run development if one is not present.
# Real credentials supplied as Cursor secrets are injected as process env vars
# and take precedence over these placeholder values, so the server still boots
# with valid Clerk/SP-API credentials when they are provided.
if [ ! -f .env ]; then
    cp .env.example .env
    # Point the server at the native local PostgreSQL instance.
    sed -i \
        -e 's/^DATABASE_PASSWORD=.*/DATABASE_PASSWORD=SecurePass123/' \
        -e 's/^DATABASE_HOST=.*/DATABASE_HOST=localhost/' \
        -e 's/^DATABASE_PORT=.*/DATABASE_PORT=5432/' \
        .env
    echo "[install] Wrote local .env (placeholder auth + local Postgres on 5432)."
else
    echo "[install] Existing .env preserved."
fi

echo "[install] Done."
