#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL 16 refuses to start when the postmaster becomes multithreaded
# during startup, which an unset or invalid locale provokes on macOS. The
# cluster below is created with `--no-locale` anyway, so pinning `C` for this
# script's children costs nothing and keeps the private cluster startable.
export LC_ALL=C

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$server_dir/../.." && pwd)"
postgres_bin_dir="$(dirname "$(realpath "$(command -v postgres)")")"
test_root="$(mktemp -d)"
# A checkout takes its port from the allocator so parallel worktrees do not
# collide. CI has no allocator and no competing checkout, and the cluster is
# private to this run either way, so a fixed port is enough there.
if command -v dev-port >/dev/null 2>&1; then
    test_port="$(dev-port --group | awk 'NR == 3 { print; exit }')"
else
    test_port=5599
fi
database_name="rankwrangler_catalog_test"
backup_database_name="rankwrangler_catalog_backup_test"
rollback_database_name="rankwrangler_catalog_rollback_test"
server_started=false
legacy_license_id="00000000-0000-4000-8000-000000000001"
service_account_id="00000000-0000-4000-8000-000000000002"
legacy_license_id_two="00000000-0000-4000-8000-000000000004"
service_account_id_two="00000000-0000-4000-8000-000000000005"
product_id="00000000-0000-4000-8000-000000000003"
preservation_manifest="$test_root/preservation-before.json"
backup_path="$test_root/rankwrangler-before-cutover.dump"

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
RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME="$database_name" \
RANKWRANGLER_DATABASE_USER=rankwrangler \
RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
RANKWRANGLER_SPAPI_REFRESH_TOKEN=test \
RANKWRANGLER_SPAPI_CLIENT_ID=test \
RANKWRANGLER_SPAPI_APP_CLIENT_SECRET=test \
MERCHBASE_CLERK_SECRET_KEY=test \
MERCHBASE_CLERK_PUBLISHABLE_KEY=pk_test_rankwrangler \
MERCHBASE_CLERK_JWT_KEY=test-jwt-key \
MERCHBASE_CLERK_ISSUER=https://clerk.test \
RANKWRANGLER_CLERK_AUTHORIZED_PARTIES=https://app.test \
RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET=test-webhook-secret \
RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=true \
MIGRATIONS_FOLDER="$server_dir/drizzle" \
bun -e "import { runMigrations, verifyMigrationTarget } from './src/db/migrate.ts'; await runMigrations(); await verifyMigrationTarget();"

"$postgres_bin_dir/psql" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    -d "$database_name" \
    -v ON_ERROR_STOP=1 \
    -c "DO \$\$
BEGIN
    IF to_regclass('public.licenses') IS NULL THEN
        RAISE EXCEPTION 'Pre-cutover migration target applied the guarded cleanup';
    END IF;
    IF to_regclass('public.rankwrangler_cutover_gate') IS NULL THEN
        RAISE EXCEPTION 'Pre-cutover migration target did not reach the additive gate schema';
    END IF;
END
\$\$;"

"$postgres_bin_dir/psql" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    -d "$database_name" \
    -v ON_ERROR_STOP=1 \
    -c "insert into licenses (id, key, email, \"lastUsedAt\", \"usageCount\", \"usageToday\", \"lastResetAt\", \"usageLimit\") values ('$legacy_license_id', 'disposable-test-key', 'preservation@example.invalid', '2026-08-01 12:00:00', 17, 5, '2026-08-01 12:00:00', 100);" \
    -c "insert into products (id, marketplace_id, asin, title) values ('$product_id', 'ATVPDKIKX0DER', 'B000000001', 'disposable preservation product');" \
    -c "insert into rankwrangler_service_accounts (id, service, merchbase_user_id, usage_today, usage_count, usage_limit, last_used_at, last_reset_at) values ('$service_account_id', 'rankwrangler', 'mbu_test_preservation', 5, 17, 100, '2026-08-01 12:00:00', '2026-08-01 12:00:00');" \
    -c "insert into access_projection (issuer, subject, state, merchbase_user_id, access, source_updated_at, last_event_id) values ('https://clerk.test', 'user_test_preservation', 'active', 'mbu_test_preservation', 'granted', 1, 'disposable-preservation-event');" \
    -c "insert into licenses (id, key, email, \"lastUsedAt\", \"usageCount\", \"usageToday\", \"lastResetAt\", \"usageLimit\") values ('$legacy_license_id_two', 'disposable-test-key-two', 'preservation-two@example.invalid', '2026-08-01 13:00:00', 9, 2, '2026-08-01 13:00:00', 50);" \
    -c "insert into rankwrangler_service_accounts (id, service, merchbase_user_id, usage_today, usage_count, usage_limit, last_used_at, last_reset_at) values ('$service_account_id_two', 'rankwrangler', 'mbu_test_preservation_two', 2, 9, 50, '2026-08-01 13:00:00', '2026-08-01 13:00:00');" \
    -c "insert into access_projection (issuer, subject, state, merchbase_user_id, access, source_updated_at, last_event_id) values ('https://clerk.test', 'user_test_preservation_two', 'active', 'mbu_test_preservation_two', 'granted', 1, 'disposable-preservation-event-two');" \
    -c "insert into rankwrangler_cutover_gate (id, legacy_license_id, service_account_id, state, plan_digest, backup_fingerprint, preservation_proof, approved_by, approved_at) values ('$service_account_id', '$legacy_license_id', '$service_account_id', 'approved', repeat('a', 64), repeat('b', 64), repeat('c', 64), 'catalog-db-test', now()), ('$service_account_id_two', '$legacy_license_id_two', '$service_account_id_two', 'approved', repeat('d', 64), repeat('e', 64), repeat('f', 64), 'catalog-db-test', now());"

"$postgres_bin_dir/pg_dump" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    --format=custom \
    --file="$backup_path" \
    "$database_name"
"$postgres_bin_dir/createdb" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    "$backup_database_name"
"$postgres_bin_dir/pg_restore" \
    --host=127.0.0.1 \
    --port="$test_port" \
    --username=rankwrangler \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    --dbname="$backup_database_name" \
    "$backup_path" >/dev/null
"$postgres_bin_dir/psql" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    -d "$backup_database_name" \
    -v ON_ERROR_STOP=1 \
    -c 'select count(*) from products' >/dev/null

"$postgres_bin_dir/createdb" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    "$rollback_database_name"
"$postgres_bin_dir/pg_restore" \
    --host=127.0.0.1 \
    --port="$test_port" \
    --username=rankwrangler \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    --dbname="$rollback_database_name" \
    "$backup_path" >/dev/null
"$postgres_bin_dir/psql" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    -d "$rollback_database_name" \
    -v ON_ERROR_STOP=1 \
    -c "update rankwrangler_cutover_gate set state = 'pending' where id = '$service_account_id';"

if RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
    RANKWRANGLER_DATABASE_PORT="$test_port" \
    RANKWRANGLER_DATABASE_NAME="$rollback_database_name" \
    RANKWRANGLER_DATABASE_USER=rankwrangler \
    RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
    RANKWRANGLER_SPAPI_REFRESH_TOKEN=test \
    RANKWRANGLER_SPAPI_CLIENT_ID=test \
    RANKWRANGLER_SPAPI_APP_CLIENT_SECRET=test \
    MERCHBASE_CLERK_SECRET_KEY=test \
    MERCHBASE_CLERK_PUBLISHABLE_KEY=pk_test_rankwrangler \
    MERCHBASE_CLERK_JWT_KEY=test-jwt-key \
    MERCHBASE_CLERK_ISSUER=https://clerk.test \
    RANKWRANGLER_CLERK_AUTHORIZED_PARTIES=https://app.test \
    RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET=test-webhook-secret \
    RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=true \
    RANKWRANGLER_DATABASE_MIGRATION_TARGET=latest \
    MIGRATIONS_FOLDER="$server_dir/drizzle" \
    bun -e "import { runMigrations } from './src/db/migrate.ts'; await runMigrations();"
then
    echo 'Expected guarded cutover migration to reject the incomplete rollback fixture.' >&2
    exit 1
fi

"$postgres_bin_dir/psql" \
    -h 127.0.0.1 \
    -p "$test_port" \
    -U rankwrangler \
    -d "$rollback_database_name" \
    -v ON_ERROR_STOP=1 \
    -c "DO \$\$
BEGIN
    IF to_regclass('public.licenses') IS NULL THEN
        RAISE EXCEPTION 'Rollback proof lost the legacy licenses table';
    END IF;
    IF (SELECT count(*) FROM licenses) <> 2 THEN
        RAISE EXCEPTION 'Rollback proof changed the legacy license rows';
    END IF;
    IF (SELECT count(*) FROM rankwrangler_cutover_gate WHERE state = 'pending') <> 1 THEN
        RAISE EXCEPTION 'Rollback proof did not retain the incomplete gate';
    END IF;
END
\$\$;"

RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME="$database_name" \
RANKWRANGLER_DATABASE_USER=rankwrangler \
RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
bun src/scripts/central-auth-preservation-proof.ts \
    "--phase=before" \
    "--legacy-license-id=$legacy_license_id" \
    "--service-account-id=$service_account_id" \
    "--manifest=$preservation_manifest"

RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME="$backup_database_name" \
RANKWRANGLER_DATABASE_USER=rankwrangler \
RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
RANKWRANGLER_SPAPI_REFRESH_TOKEN=test \
RANKWRANGLER_SPAPI_CLIENT_ID=test \
RANKWRANGLER_SPAPI_APP_CLIENT_SECRET=test \
MERCHBASE_CLERK_SECRET_KEY=test \
MERCHBASE_CLERK_PUBLISHABLE_KEY=pk_test_rankwrangler \
MERCHBASE_CLERK_JWT_KEY=test-jwt-key \
MERCHBASE_CLERK_ISSUER=https://clerk.test \
RANKWRANGLER_CLERK_AUTHORIZED_PARTIES=https://app.test \
RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET=test-webhook-secret \
RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=true \
RANKWRANGLER_DATABASE_MIGRATION_TARGET=latest \
MIGRATIONS_FOLDER="$server_dir/drizzle" \
bun -e "import { runMigrations, verifyMigrationTarget } from './src/db/migrate.ts'; await runMigrations(); await verifyMigrationTarget();"

RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME="$backup_database_name" \
RANKWRANGLER_DATABASE_USER=rankwrangler \
RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
bun src/scripts/central-auth-preservation-proof.ts \
    "--phase=after" \
    "--legacy-license-id=$legacy_license_id" \
    "--service-account-id=$service_account_id" \
    "--manifest=$preservation_manifest"

RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME="$database_name" \
RANKWRANGLER_DATABASE_USER=rankwrangler \
RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
RANKWRANGLER_SPAPI_REFRESH_TOKEN=test \
RANKWRANGLER_SPAPI_CLIENT_ID=test \
RANKWRANGLER_SPAPI_APP_CLIENT_SECRET=test \
MERCHBASE_CLERK_SECRET_KEY=test \
MERCHBASE_CLERK_PUBLISHABLE_KEY=pk_test_rankwrangler \
MERCHBASE_CLERK_JWT_KEY=test-jwt-key \
MERCHBASE_CLERK_ISSUER=https://clerk.test \
RANKWRANGLER_CLERK_AUTHORIZED_PARTIES=https://app.test \
RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET=test-webhook-secret \
RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=true \
RANKWRANGLER_DATABASE_MIGRATION_TARGET=latest \
MIGRATIONS_FOLDER="$server_dir/drizzle" \
bun -e "import { runMigrations, verifyMigrationTarget } from './src/db/migrate.ts'; await runMigrations(); await verifyMigrationTarget();"

"$postgres_bin_dir/pg_restore" --list "$backup_path" >/dev/null

cd "$repo_dir"
RANKWRANGLER_DATABASE_HOST=127.0.0.1 \
RANKWRANGLER_DATABASE_PORT="$test_port" \
RANKWRANGLER_DATABASE_NAME="$database_name" \
RANKWRANGLER_DATABASE_USER=rankwrangler \
RANKWRANGLER_DATABASE_PASSWORD=rankwrangler \
RANKWRANGLER_SPAPI_REFRESH_TOKEN=test \
RANKWRANGLER_SPAPI_CLIENT_ID=test \
RANKWRANGLER_SPAPI_APP_CLIENT_SECRET=test \
MERCHBASE_CLERK_SECRET_KEY=test \
MERCHBASE_CLERK_PUBLISHABLE_KEY=pk_test_rankwrangler \
MERCHBASE_CLERK_JWT_KEY=test-jwt-key \
MERCHBASE_CLERK_ISSUER=https://clerk.test \
RANKWRANGLER_CLERK_AUTHORIZED_PARTIES=https://app.test \
RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET=test-webhook-secret \
RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=true \
RUN_CATALOG_DB_TESTS=true \
bun test \
    apps/server/test/central-auth.db.test.ts \
    apps/server/test/catalog-search-concurrency.db.test.ts \
    apps/server/test/catalog-search-history.db.test.ts \
    apps/server/test/catalog-query-refresh.db.test.ts \
    apps/server/test/merch-listing-classification.db.test.ts
