import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import {
    createDatabaseConnectionOptions,
    databaseConfigurationSchema,
} from '../src/config/database-connection';
import { runMigrations, verifyMigrationTarget } from '../src/db/migrate';

const original = process.env.MIGRATIONS_FOLDER;
const staged = process.env.COLLECTION_TEST_MIGRATIONS_FOLDER;
if (
    !(original && staged) ||
    process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
    process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
) {
    throw new Error('Collection upgrade fixture requires the private loopback harness.');
}
const journal = JSON.parse(readFileSync(join(original, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 40);
mkdirSync(join(staged, 'meta'), { recursive: true });
writeFileSync(join(staged, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
for (const entry of entries) {
    cpSync(join(original, `${entry.tag}.sql`), join(staged, `${entry.tag}.sql`));
}
await runMigrations(staged, 'latest');

const sql = postgres({
    ...createDatabaseConnectionOptions(databaseConfigurationSchema.parse(process.env), 'direct'),
    max: 1,
});
try {
    await sql`insert into products (marketplace_id, asin, is_merch_listing)
        values ('ATVPDKIKX0DER', 'B0UNKNOWN1', null), ('ATVPDKIKX0DER', 'B0MERCH001', true)`;
    const [query] = await sql`insert into catalog_queries
        (source, marketplace_id, normalized_term, display_term, page, active_until, latest_successful_run_at)
        values ('keepa', 'ATVPDKIKX0DER', 'migration fishing', 'Migration fishing', 0,
            timezone('UTC', now()) + interval '30 days', '2026-10-22 12:00:00') returning id`;
    for (const day of [21, 22]) {
        const [operation] =
            await sql`insert into operations (type, target_key, input, status, resource, completed_at)
            values ('catalogSearch', ${query.id}, '{}', 'completed', '{}', ${`2026-10-${day}T12:00:00Z`}::timestamp)
            returning id`;
        const [run] = await sql`insert into catalog_search_runs
            (query_id, operation_id, source_started_at, source_completed_at, trigger, result_count, normalizer_version)
            values (${query.id}, ${operation.id}, ${`2026-10-${day}T11:59:00Z`}::timestamp,
                ${`2026-10-${day}T12:00:00Z`}::timestamp, 'requested', 1, 1) returning id`;
        await sql`insert into catalog_search_results (run_id, product_id, source_position)
            select ${run.id}, id, 1 from products where asin = 'B0MERCH001'`;
    }
} finally {
    await sql.end();
}
await runMigrations(original, 'latest');
await verifyMigrationTarget(original, 'latest');
