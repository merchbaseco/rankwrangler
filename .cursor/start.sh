#!/usr/bin/env bash
# Per-boot startup for RankWrangler Cloud Agents.
# Starts the local PostgreSQL 16 cluster, ensures the database/role/extension
# exist, then launches the development servers (server + website) attached so
# their logs stay visible. Idempotent and safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

# Start the PostgreSQL 16 cluster if it is not already accepting connections.
if ! $SUDO pg_ctlcluster 16 main status >/dev/null 2>&1; then
    $SUDO pg_ctlcluster 16 main start
fi

# Wait for PostgreSQL to accept TCP connections.
for _ in $(seq 1 30); do
    if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Ensure the application role and database exist (idempotent).
$SUDO -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $do$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rankwrangler') THEN
        CREATE USER rankwrangler WITH PASSWORD 'SecurePass123';
    END IF;
END $do$;
SELECT 'CREATE DATABASE rankwrangler OWNER rankwrangler'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rankwrangler')\gexec
GRANT ALL PRIVILEGES ON DATABASE rankwrangler TO rankwrangler;
SQL

# Ensure schema ownership and the uuid-ossp extension.
$SUDO -u postgres psql -d rankwrangler -v ON_ERROR_STOP=1 <<'SQL'
ALTER SCHEMA public OWNER TO rankwrangler;
GRANT ALL ON SCHEMA public TO rankwrangler;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

echo "[start] PostgreSQL ready on localhost:5432 (database: rankwrangler)."
echo "[start] Launching development servers (server:8080, website:5173)..."

# Launch the development servers attached so logs remain visible for the agent.
exec bun run dev
