import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import postgres from 'postgres';
import { PgBoss } from 'pg-boss';
import {
    assertDatabasePreserved,
    captureDatabaseManifest,
    databaseManifestSchema,
} from '../src/scripts/database-preservation';

const enabled =
    process.env.RUN_PRESERVATION_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_preservation_test';
const describeDatabase = enabled ? describe : describe.skip;

describeDatabase('database preservation against PostgreSQL', () => {
    const sql = postgres({
        host: '127.0.0.1',
        port: Number(process.env.RANKWRANGLER_DATABASE_PORT),
        database: 'rankwrangler_preservation_test',
        username: 'rankwrangler',
        max: 1,
    });

    beforeAll(async () => {
        await sql`CREATE TABLE products (id uuid PRIMARY KEY, payload jsonb)`;
        await sql`INSERT INTO products VALUES
            ('00000000-0000-4000-8000-000000000001', '{"title":"same row count"}')`;
        await sql`CREATE SCHEMA drizzle`;
        await sql`CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text)`;
        await sql`INSERT INTO drizzle.__drizzle_migrations (hash) VALUES ('existing-ledger')`;
        await sql`CREATE SCHEMA pgboss`;
        await sql`CREATE TABLE pgboss.job (id integer, payload text) PARTITION BY RANGE (id)`;
        await sql`CREATE TABLE pgboss.job_child PARTITION OF pgboss.job FOR VALUES FROM (0) TO (10)`;
        await sql`INSERT INTO pgboss.job VALUES (1, 'pending work')`;
        await sql`CREATE TABLE history (id integer PRIMARY KEY, keepa_minutes integer,
            value_int integer, is_missing boolean, category_id bigint)`;
        await sql`INSERT INTO history
            SELECT value, 8000000 + value, CASE WHEN value % 2 = 0 THEN NULL ELSE 1999 END,
                value % 2 = 0, 7141123011 FROM generate_series(1, 21000) value`;
    });

    afterAll(async () => {
        await sql.end();
    });

    test('streams all points, includes migration and queue schemas, and avoids double counting partitions', async () => {
        const before = databaseManifestSchema.parse(
            JSON.parse(JSON.stringify(await captureDatabaseManifest(sql)))
        );
        const after = await captureDatabaseManifest(sql);
        expect(() => assertDatabasePreserved(before, after)).not.toThrow();
        expect(before.tables.find(table => table.name === 'history')?.rows).toBe(21000);
        expect(before.tables.find(table => table.schema === 'pgboss')?.rows).toBe(1);
        expect(before.tables.some(table => table.name === 'job_child')).toBe(false);
        expect(before.tables.some(table => table.schema === 'drizzle')).toBe(true);
        expect(before.sequences).toHaveLength(1);
        expect(JSON.stringify(before)).not.toContain('same row count');
    });

    test('detects changed values even when row counts are unchanged', async () => {
        const before = await captureDatabaseManifest(sql);
        await sql`UPDATE history SET is_missing = false WHERE id = 2`;
        const after = await captureDatabaseManifest(sql);
        expect(before.tables.map(table => table.rows)).toEqual(
            after.tables.map(table => table.rows)
        );
        expect(() => assertDatabasePreserved(before, after)).toThrow('preservation failed');
    });

    test('detects sequence drift independently of table contents', async () => {
        const before = await captureDatabaseManifest(sql);
        await sql`SELECT nextval('drizzle.__drizzle_migrations_id_seq')`;
        const after = await captureDatabaseManifest(sql);
        expect(before.tables).toEqual(after.tables);
        expect(() => assertDatabasePreserved(before, after)).toThrow('preservation failed');
    });

    test('preserves text-key rows using bounded digest ordering and detects changed values', async () => {
        await sql`CREATE TABLE text_key_history (id text PRIMARY KEY, value integer)`;
        await sql`INSERT INTO text_key_history
            SELECT value::text, value FROM generate_series(1, 12000) value`;
        try {
            const before = await captureDatabaseManifest(sql);
            expect(before.tables.find(table => table.name === 'text_key_history')?.rows).toBe(
                12000
            );
            await sql`UPDATE text_key_history SET value = -1 WHERE id = '12000'`;
            const after = await captureDatabaseManifest(sql);
            expect(() => assertDatabasePreserved(before, after)).toThrow('preservation failed');
        } finally {
            await sql`DROP TABLE text_key_history`;
        }
    });

    test('preserves unordered rows after rewriting their physical order', async () => {
        await sql`CREATE TABLE unordered_history AS SELECT generate_series(1, 21000) AS id`;
        await sql`INSERT INTO unordered_history VALUES (1)`;
        try {
            const before = await captureDatabaseManifest(sql);
            expect(before.tables.find(table => table.name === 'unordered_history')?.rows).toBe(
                21001
            );
            await sql`CREATE TEMP TABLE reversed_history AS
                SELECT * FROM unordered_history ORDER BY id DESC`;
            await sql`TRUNCATE unordered_history`;
            await sql`INSERT INTO unordered_history SELECT * FROM reversed_history`;
            await sql`DROP TABLE reversed_history`;
            const after = await captureDatabaseManifest(sql);
            expect(() => assertDatabasePreserved(before, after)).not.toThrow();
        } finally {
            await sql`DROP TABLE unordered_history`;
        }
    });

    test('pg-boss recovers queued work after restarting on PostgreSQL 18', async () => {
        const options = {
            host: '127.0.0.1',
            port: Number(process.env.RANKWRANGLER_DATABASE_PORT),
            database: 'rankwrangler_preservation_test',
            user: 'rankwrangler',
            schema: 'preservation_queue_test',
            supervise: false,
            schedule: false,
        };
        const first = new PgBoss(options);
        await first.start();
        let id: string | null;
        try {
            await first.createQueue('migration-rehearsal');
            id = await first.send('migration-rehearsal', { product: 'disposable' });
            expect(id).toBeTruthy();
        } finally {
            await first.stop();
        }
        const restarted = new PgBoss(options);
        await restarted.start();
        try {
            const jobs = await restarted.fetch<{ product: string }>('migration-rehearsal');
            expect(jobs).toHaveLength(1);
            expect(jobs[0]?.data).toEqual({ product: 'disposable' });
            if (!id) throw new Error('Expected a queued job.');
            await restarted.complete('migration-rehearsal', id);
            expect(await restarted.fetch('migration-rehearsal')).toHaveLength(0);
        } finally {
            await restarted.stop();
        }
    });
});
