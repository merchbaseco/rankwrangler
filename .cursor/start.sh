#!/usr/bin/env bash
# Per-boot runtime reconciliation for RankWrangler Cloud Agents.
# Starts the local PostgreSQL 16 cluster and ensures the rankwrangler database,
# role, and required extension exist. Idempotent and safe to re-run.
set -euo pipefail

# Start the PostgreSQL 16 cluster if it is not already accepting connections.
if ! sudo pg_ctlcluster 16 main status >/dev/null 2>&1; then
    sudo pg_ctlcluster 16 main start
fi

# Wait for PostgreSQL to accept TCP connections on the expected port.
for _ in $(seq 1 30); do
    if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Ensure the application role and database exist (idempotent).
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $do$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'rankwrangler') THEN
        CREATE USER rankwrangler WITH PASSWORD 'SecurePass123';
    END IF;
END $do$;
SELECT 'CREATE DATABASE rankwrangler OWNER rankwrangler'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rankwrangler')\gexec
GRANT ALL PRIVILEGES ON DATABASE rankwrangler TO rankwrangler;
SQL

# Ensure the schema is owned by the app role and the uuid-ossp extension exists.
sudo -u postgres psql -d rankwrangler -v ON_ERROR_STOP=1 <<'SQL'
ALTER SCHEMA public OWNER TO rankwrangler;
GRANT ALL ON SCHEMA public TO rankwrangler;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

echo "[start] PostgreSQL ready on localhost:5432 (database: rankwrangler)."
