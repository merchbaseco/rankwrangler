#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$server_dir/../.." && pwd)"
postgres_bin_dir="$(dirname "$(realpath "$(command -v postgres)")")"
test_root="$(mktemp -d)"
test_port="$(dev-port --group | awk 'NR == 3 { print; exit }')"
database_name="rankwrangler_catalog_test"
server_started=false

cleanup() {
    if [[ "$server_started" == true ]]; then
        "$postgres_bin_dir/pg_ctl" -D "$test_root/data" -m immediate -w stop >/dev/null
    fi
    rm -rf "$test_root"
}
trap cleanup EXIT

"$postgres_bin_dir/initdb" \
    --auth=trust \
    --encoding=UTF8 \
    --no-locale \
    --username=rankwrangler \
    --set=shared_memory_type=mmap \
    --set=dynamic_shared_memory_type=mmap \
    -D "$test_root/data" >/dev/null
"$postgres_bin_dir/pg_ctl" \
    -D "$test_root/data" \
    -l "$test_root/postgres.log" \
    -o "-h 127.0.0.1 -k $test_root -p $test_port -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap" \
    -w start >/dev/null
server_started=true
"$postgres_bin_dir/createdb" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    "$database_name"
cd "$server_dir"
DATABASE_HOST=127.0.0.1 \
DATABASE_PORT="$test_port" \
DATABASE_NAME="$database_name" \
DATABASE_USER=rankwrangler \
DATABASE_PASSWORD=rankwrangler \
SPAPI_REFRESH_TOKEN=test \
SPAPI_CLIENT_ID=test \
SPAPI_APP_CLIENT_SECRET=test \
LICENSE_SECRET=0123456789abcdef0123456789abcdef \
CLERK_SECRET_KEY=test \
DISABLE_SERVER_JOB_RUNNER=true \
bun -e "import { runMigrations } from './src/db/migrate.ts'; await runMigrations();"

cd "$repo_dir"
DATABASE_HOST=127.0.0.1 \
DATABASE_PORT="$test_port" \
DATABASE_NAME="$database_name" \
DATABASE_USER=rankwrangler \
DATABASE_PASSWORD=rankwrangler \
SPAPI_REFRESH_TOKEN=test \
SPAPI_CLIENT_ID=test \
SPAPI_APP_CLIENT_SECRET=test \
LICENSE_SECRET=0123456789abcdef0123456789abcdef \
CLERK_SECRET_KEY=test \
DISABLE_SERVER_JOB_RUNNER=true \
RUN_CATALOG_DB_TESTS=true \
bun test \
    apps/server/test/catalog-search-concurrency.db.test.ts \
    apps/server/test/catalog-search-history.db.test.ts
