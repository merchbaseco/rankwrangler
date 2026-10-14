#!/usr/bin/env bash
# RankWrangler per-session services, the repo-owned part of the fleet cloud
# agent contract: the loopback PostgreSQL cluster on 5433 and its synthetic
# seed. Idempotent and safe to re-run. It returns; the development servers are
# launched separately (Cursor's `dev` terminal, or by hand in Claude; see
# "Cloud agents" in AGENTS.md).
set -euo pipefail

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# PostgreSQL server binaries refuse to run as root. Claude cloud containers run
# as root without sudo, so act as the postgres account through runuser there;
# Cursor runs as a sudo-capable user. pg_ctlcluster itself drops to the cluster
# owner when invoked as root.
if [ "$(id -u)" -eq 0 ]; then
    privileged=()
    as_postgres=(runuser -u postgres --)
else
    privileged=(sudo)
    as_postgres=(sudo -u postgres)
fi

PG_CLUSTER="$(ls -d /etc/postgresql/*/main 2>/dev/null | head -1 || true)"
PG_VERSION="$(basename "$(dirname "${PG_CLUSTER:-/16/main}")")"

if ! "${privileged[@]}" pg_ctlcluster "$PG_VERSION" main status >/dev/null 2>&1; then
    "${privileged[@]}" pg_ctlcluster "$PG_VERSION" main start
fi

for _ in $(seq 1 30); do
    if pg_isready -h localhost -p 5433 >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# The database password is a schema item, so the local cluster is provisioned
# with the same value the server will resolve — one owner, no drift. The value
# moves through a pipe into psql and is never printed.
DB_USER="$(bunx varlock printenv RANKWRANGLER_DATABASE_USER)"
DB_NAME="$(bunx varlock printenv RANKWRANGLER_DATABASE_NAME)"
DB_PASSWORD="$(bunx varlock printenv RANKWRANGLER_DATABASE_PASSWORD)"

"${as_postgres[@]}" psql -p 5433 -v ON_ERROR_STOP=1 \
    -v db_user="$DB_USER" -v db_name="$DB_NAME" -v db_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE USER %I WITH PASSWORD %L', :'db_user', :'db_password')
    WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('ALTER USER %I WITH PASSWORD %L', :'db_user', :'db_password')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SQL

"${as_postgres[@]}" psql -p 5433 -d "$DB_NAME" -v ON_ERROR_STOP=1 -v db_user="$DB_USER" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'db_user')\gexec
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_user')\gexec
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

unset DB_PASSWORD

echo "[start] PostgreSQL ready on localhost:5433 (database: ${DB_NAME})."

# Fill the freshly provisioned database with a synthetic recent week so the
# dashboard opens on a real catalog instead of an empty one. This is the cloud
# session path and only that path — a local checkout points at whatever
# database the developer chose, so seeding there stays an explicit
# `bun run db:seed:dev`. The seed refuses any non-loopback host on its own, and
# it is idempotent: every boot clears the previous synthetic week and rewrites
# it anchored to the current time, so a resumed agent never opens on a stale
# one. It also migrates to `latest` first, which a development database
# otherwise does not reach, and grants the shared Dev Sign-In user access to
# this database, without which every api.app call would 401 against a perfectly
# seeded catalog. Its output — target, signed-in user, row counts, through-day —
# goes straight to this log; nothing is captured or discarded. Best-effort: a
# failed seed must not fail the session start.
echo "[start] Seeding synthetic development data..."
if ! bunx varlock run -- bun run --filter @rankwrangler/server database:seed:dev; then
    echo "[start] WARNING: development seed failed; continuing with an unseeded database." >&2
fi
