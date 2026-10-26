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
const discoveryEntries = journal.entries.filter((entry: { idx: number }) => entry.idx < 41);
writeFileSync(
    join(staged, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries: discoveryEntries })
);
for (const entry of discoveryEntries) {
    cpSync(join(original, `${entry.tag}.sql`), join(staged, `${entry.tag}.sql`));
}
await runMigrations(staged, 'latest');
const discoverySql = postgres({
    ...createDatabaseConnectionOptions(databaseConfigurationSchema.parse(process.env), 'direct'),
    max: 1,
});
try {
    const [query] =
        await discoverySql`select id from catalog_queries where normalized_term='migration fishing'`;
    const [pass] = await discoverySql`insert into keyword_exploration_passes
        (query_id,next_page_token,next_page,contiguous_pages,stop_reason,claim_at)
        values (${query.id},'preserved-frontier',3,3,'budget',timezone('UTC',now())) returning id`;
    const receipts =
        await discoverySql`insert into keyword_discovery_attempts(query_id,pass_id,page,status)
        values (${query.id},${pass.id},0,'accepted'),(${query.id},${pass.id},0,'accepted') returning id`;
    const fingerprint = async () =>
        await discoverySql`select
        (select count(*) from products)::int products,
        (select count(*) from product_history_points)::int history,
        (select count(*) from product_history_imports)::int imports,
        (select count(*) from catalog_search_runs)::int runs,
        (select count(*) from catalog_search_results)::int results,
        (select count(*) from keyword_products)::int membership`;
    const before = await fingerprint();
    await runMigrations(original, 'latest');
    await verifyMigrationTarget(original, 'latest');
    const [preserved] = await discoverySql`select p.*,t.query_id from keyword_exploration_passes p
        join discovery_targets t on t.id=p.target_id where p.id=${pass.id}`;
    const afterReceipts =
        await discoverySql`select id from keyword_discovery_attempts where pass_id=${pass.id}`;
    if (
        preserved.query_id !== query.id ||
        preserved.next_page_token !== 'preserved-frontier' ||
        preserved.next_page !== 3 ||
        preserved.contiguous_pages !== 3 ||
        !preserved.claim_token ||
        JSON.stringify(before) !== JSON.stringify(await fingerprint()) ||
        receipts
            .map(row => row.id)
            .sort()
            .join() !==
            afterReceipts
                .map(row => row.id)
                .sort()
                .join()
    ) {
        throw new Error(
            'Scoped discovery migration did not preserve canonical data and continuation'
        );
    }
    console.log(
        '[Migration proof] Discovery targets preserve data, pass, cursor and legacy duplicate receipts'
    );
} finally {
    await discoverySql.end();
}
