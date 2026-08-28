#!/usr/bin/env bash
# Per-boot startup for RankWrangler Cursor cloud agents.
# Starts the local PostgreSQL cluster, ensures the role/database/extension
# exist using the credential the schema resolves, then launches the development
# servers under varlock. Idempotent and safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

PG_CLUSTER="$(ls -d /etc/postgresql/*/main 2>/dev/null | head -1 || true)"
PG_VERSION="$(basename "$(dirname "${PG_CLUSTER:-/16/main}")")"

if ! $SUDO pg_ctlcluster "$PG_VERSION" main status >/dev/null 2>&1; then
    $SUDO pg_ctlcluster "$PG_VERSION" main start
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

$SUDO -u postgres psql -p 5433 -v ON_ERROR_STOP=1 \
    -v db_user="$DB_USER" -v db_name="$DB_NAME" -v db_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE USER %I WITH PASSWORD %L', :'db_user', :'db_password')
    WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('ALTER USER %I WITH PASSWORD %L', :'db_user', :'db_password')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SQL

$SUDO -u postgres psql -p 5433 -d "$DB_NAME" -v ON_ERROR_STOP=1 -v db_user="$DB_USER" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'db_user')\gexec
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_user')\gexec
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL

unset DB_PASSWORD

echo "[start] PostgreSQL ready on localhost:5433 (database: ${DB_NAME})."

# Fill the freshly provisioned database with a synthetic recent week so the
# dashboard opens on a real catalog instead of an empty one. This is the cloud
# boot path and only the cloud boot path — a local checkout points at whatever
# database the developer chose, so seeding there stays an explicit
# `bun run db:seed:dev`. The seed refuses any non-loopback host on its own, and
# it is idempotent: every boot clears the previous synthetic week and rewrites
# it anchored to the current time, so a resumed agent never opens on a stale
# one. It also migrates to `latest` first, which a development database
# otherwise does not reach, and grants the shared Dev Sign-In user access to
# this database, without which every api.app call would 401 against a perfectly
# seeded catalog. Its output — target, signed-in user, row counts, through-day —
# goes straight to this log; nothing is captured or discarded. Best-effort: a
# failed seed must not stop the development servers from starting.
echo "[start] Seeding synthetic development data..."
if ! bunx varlock run -- bun run --filter @rankwrangler/server database:seed:dev; then
    echo "[start] WARNING: development seed failed; continuing with an unseeded database." >&2
fi

# Fleet agents. $root is the product checkout; seed-cloud.sh links skills
# and global AGENTS.md/CLAUDE.md. Best-effort: failure must not stop servers.
root="$REPO_ROOT"
# Fleet agents. Fetch on every boot so a reused snapshot cannot pin a stale copy.
if [ -n "${CURSOR_CLOUD_AGENTS_GH_READ_TOKEN:-}" ]; then
  agents_tmp="$(mktemp -d)" || agents_tmp=""
  if [ -n "$agents_tmp" ] &&
    curl -fsSL -H "Authorization: Bearer $CURSOR_CLOUD_AGENTS_GH_READ_TOKEN" \
      https://api.github.com/repos/zknicker/agents/tarball/main \
      | tar -xz -C "$agents_tmp"; then
    agents_src=""
    for agents_candidate in "$agents_tmp"/*; do
      if [ -f "$agents_candidate/cursor/seed-cloud.sh" ]; then
        agents_src="$agents_candidate"
        break
      fi
    done
    if [ -n "$agents_src" ]; then
      rm -rf "$HOME/.agents/upstream"
      mkdir -p "$HOME/.agents"
      mv "$agents_src" "$HOME/.agents/upstream"
      if bash "$HOME/.agents/upstream/cursor/seed-cloud.sh" --repo-root "$root"; then
        echo "[start] Seeded fleet agents from zknicker/agents."
      else
        echo "[start] Skipping fleet agents (seed-cloud.sh failed)." >&2
      fi
    else
      echo "[start] Skipping fleet agents (seed-cloud.sh missing)." >&2
    fi
  else
    echo "[start] Skipping fleet agents (tarball fetch failed)." >&2
  fi
  rm -rf "$agents_tmp" || true
else
  echo "[start] Skipping fleet agents (no read token)." >&2
fi

# Cursor forwards a session's ports by watching the VM for listening sockets,
# and a loopback-only bind is invisible to that watcher, so the agent's browser
# could never reach Vite. RANKWRANGLER_DEV_HOST is the repository's neutral
# contract for that bind address; exporting it here is what keeps the knowledge
# that Cursor works this way under .cursor/ instead of in app code. varlock
# resolves the declared item from process.env and validates it before handing it
# to the child, so an exported value survives `varlock run`. The server already
# binds 0.0.0.0 unconditionally and needs no equivalent.
export RANKWRANGLER_DEV_HOST=0.0.0.0

echo "[start] Launching development servers (server:8080, website:5173)..."

# `concurrently` is invoked directly rather than through `bun run dev` because
# the root script passes Bun's --elide-lines=0, which aborts in non-terminal
# contexts such as this start script.
exec bunx varlock run -- node_modules/.bin/concurrently -k -n server,website -c cyan,magenta \
    "bun run --filter @rankwrangler/server dev" \
    "bun run --filter @rankwrangler/website dev"
