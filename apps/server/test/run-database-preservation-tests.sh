#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
postgres_bin_dir="$(dirname "$(command -v postgres)")"
test_root="$(mktemp -d)"
test_port="$(cd "$repo_dir" && dev-port "${1:-3}")"
server_started=false

cleanup() {
    if [[ "$server_started" == true ]]; then
        "$postgres_bin_dir/pg_ctl" -D "$test_root/data" -m immediate -w stop >/dev/null
    fi
    trash "$test_root"
}
trap cleanup EXIT

"$postgres_bin_dir/initdb" --auth=trust --encoding=UTF8 --no-locale --username=rankwrangler \
    --set=shared_memory_type=mmap --set=dynamic_shared_memory_type=mmap \
    -D "$test_root/data" >/dev/null
"$postgres_bin_dir/pg_ctl" -D "$test_root/data" -l "$test_root/postgres.log" \
    -o "-h 127.0.0.1 -k $test_root -p $test_port -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap" \
    -w start >/dev/null
server_started=true
"$postgres_bin_dir/createdb" -h 127.0.0.1 -p "$test_port" -U rankwrangler rankwrangler_preservation_test

cd "$repo_dir"
RUN_PRESERVATION_DB_TESTS=true \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME=rankwrangler_preservation_test \
bun test apps/server/test/database-preservation.db.test.ts

"$postgres_bin_dir/pg_dump" -h 127.0.0.1 -p "$test_port" -U rankwrangler \
    --format=custom --file="$test_root/source.dump" rankwrangler_preservation_test
"$postgres_bin_dir/createdb" -h 127.0.0.1 -p "$test_port" -U rankwrangler rankwrangler_preservation_restore
"$postgres_bin_dir/pg_restore" -h 127.0.0.1 -p "$test_port" -U rankwrangler \
    --exit-on-error --no-owner --no-privileges \
    --dbname=rankwrangler_preservation_restore "$test_root/source.dump"

RANKWRANGLER_DATABASE_PORT="$test_port" bun -e '
import postgres from "./apps/server/node_modules/postgres";
import { captureDatabaseManifest, assertDatabasePreserved } from "./apps/server/src/scripts/database-preservation";
const options = { host: "127.0.0.1", port: Number(process.env.RANKWRANGLER_DATABASE_PORT), username: "rankwrangler", max: 1 };
const source = postgres({ ...options, database: "rankwrangler_preservation_test" });
const target = postgres({ ...options, database: "rankwrangler_preservation_restore" });
try {
    assertDatabasePreserved(await captureDatabaseManifest(source), await captureDatabaseManifest(target));
    console.log("Dump/restore preservation verified.");
} finally { await source.end(); await target.end(); }
'

env -i PATH="$PATH" RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
    RANKWRANGLER_DATABASE_PORT="$test_port" RANKWRANGLER_DATABASE_USER=rankwrangler \
    RANKWRANGLER_DATABASE_NAME=rankwrangler_preservation_test \
    bun apps/server/src/scripts/database-preservation-proof.ts \
    --phase=capture "--manifest=$test_root/manifest.json"
env -i PATH="$PATH" RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
    RANKWRANGLER_DATABASE_PORT="$test_port" RANKWRANGLER_DATABASE_USER=rankwrangler \
    RANKWRANGLER_DATABASE_NAME=rankwrangler_preservation_restore \
    bun apps/server/src/scripts/database-preservation-proof.ts \
    --phase=verify "--manifest=$test_root/manifest.json"
