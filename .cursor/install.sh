#!/usr/bin/env bash
# Idempotent repository bootstrap for RankWrangler Cloud Agents.
# Runs after the source tree is checked out. Installs the system toolchain
# (PostgreSQL 16 + Bun) if missing, installs workspace dependencies, and
# materializes a local `.env` for host-run development. Safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Use sudo only when not already root (build pods may run as root).
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

# --- System dependency: PostgreSQL 16 (native; Docker is unavailable in the VM) ---
# apt fetches occasionally return transient proxy errors (e.g. 400) in build
# pods, so retry both the apt-level fetch and the whole step.
if ! command -v psql >/dev/null 2>&1; then
    echo "[install] Installing PostgreSQL..."
    install_postgres() {
        $SUDO apt-get update -y -o Acquire::Retries=5
        $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y \
            -o Acquire::Retries=5 --fix-missing \
            postgresql postgresql-contrib
    }
    pg_installed=0
    for attempt in 1 2 3; do
        if install_postgres; then
            pg_installed=1
            break
        fi
        echo "[install] apt attempt ${attempt} failed; retrying in 5s..." >&2
        sleep 5
    done
    if [ "$pg_installed" -ne 1 ]; then
        echo "[install] ERROR: PostgreSQL installation failed after retries." >&2
        exit 1
    fi
else
    echo "[install] PostgreSQL already present."
fi

# --- System dependency: Bun 1.3.5 (pinned by package.json packageManager) ---
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
    echo "[install] Installing Bun 1.3.5..."
    curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.5"
else
    echo "[install] Bun already present ($(bun --version))."
fi

# --- Workspace dependencies ---
# Requires MERCHBASE_GITHUB_NPM_TOKEN in the environment so the private
# @merchbaseco scope resolves from GitHub Packages (npm.pkg.github.com).
if [ -z "${MERCHBASE_GITHUB_NPM_TOKEN:-}" ]; then
    echo "[install] WARNING: MERCHBASE_GITHUB_NPM_TOKEN is not set; the private" \
        "@merchbaseco/access package cannot be fetched from GitHub Packages." >&2
fi
bun install --frozen-lockfile

# --- Local .env for host-run development ---
# Real credentials supplied as Cursor secrets are injected as process env vars
# and take precedence over these placeholders (dotenv does not override existing
# env), so the server still boots with valid credentials when they are provided.
if [ ! -f .env ]; then
    cp .env.example .env
    # Point the server at the native local PostgreSQL instance, and keep the
    # background job runner disabled for local dev (the documented default).
    # Leaving DISABLE_SERVER_JOB_RUNNER=false with the pre-cutover migration
    # target crashes the server at boot, because the enabled job runner queries
    # columns that only exist in post-cutover migrations.
    sed -i \
        -e 's/^DATABASE_PASSWORD=.*/DATABASE_PASSWORD=SecurePass123/' \
        -e 's/^DATABASE_HOST=.*/DATABASE_HOST=localhost/' \
        -e 's/^DATABASE_PORT=.*/DATABASE_PORT=5432/' \
        -e 's/^DISABLE_SERVER_JOB_RUNNER=.*/DISABLE_SERVER_JOB_RUNNER=true/' \
        .env
    echo "[install] Wrote local .env (placeholder auth + local Postgres on 5432)."
else
    echo "[install] Existing .env preserved."
fi

echo "[install] Done."
