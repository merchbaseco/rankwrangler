import type postgres from 'postgres';
import { z } from 'zod';
import { captureRowFingerprint } from './database-fingerprints';

const tableSchema = z.object({
    schema: z.string(),
    name: z.string(),
    rows: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    columns: z.string(),
});

export const databaseManifestSchema = z.object({
    version: z.literal(1),
    algorithm: z.literal('sha256-sorted-row-digests'),
    capturedAt: z.iso.datetime(),
    tables: z.array(tableSchema),
    sequences: z.array(z.object({ schema: z.string(), name: z.string(), state: z.string() })),
});

type DatabaseManifest = z.infer<typeof databaseManifestSchema>;

export const captureDatabaseManifest = async (sql: postgres.Sql): Promise<DatabaseManifest> => {
    const manifest: DatabaseManifest = {
        version: 1,
        algorithm: 'sha256-sorted-row-digests',
        capturedAt: new Date().toISOString(),
        tables: [],
        sequences: [],
    };
    await sql.begin('isolation level repeatable read read only', async transaction => {
        await transaction.unsafe("SET LOCAL timezone = 'UTC'");
        await transaction.unsafe("SET LOCAL datestyle = 'ISO, YMD'");
        await transaction.unsafe("SET LOCAL intervalstyle = 'postgres'");
        await transaction.unsafe("SET LOCAL statement_timeout = '30min'");
        const tables = await transaction.unsafe<
            {
                schema: string;
                name: string;
                columns: string;
            }[]
        >(`
            SELECT n.nspname AS schema, c.relname AS name,
                (SELECT jsonb_agg(jsonb_build_array(a.attname,
                    format_type(a.atttypid, a.atttypmod), a.attnotnull,
                    pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attnum)::text
                 FROM pg_attribute a
                 LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                 WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('public', 'drizzle', 'pgboss')
                AND c.relkind IN ('r', 'p') AND NOT c.relispartition
            ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"
        `);
        if (!tables.some(table => table.schema === 'public' && table.name === 'products')) {
            throw new Error('The database does not contain the RankWrangler Product catalog.');
        }
        for (const table of tables) {
            const relation = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
            const fingerprint = await captureRowFingerprint(
                transaction
                    .unsafe<{ row: string }[]>(
                        `SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row
                            FROM ${relation} t`
                    )
                    .cursor(10000)
            );
            manifest.tables.push({
                schema: table.schema,
                name: table.name,
                columns: table.columns,
                ...fingerprint,
            });
        }
        const sequences = await transaction.unsafe<{ schema: string; name: string }[]>(`
            SELECT schemaname AS schema, sequencename AS name FROM pg_sequences
            WHERE schemaname IN ('public', 'drizzle', 'pgboss')
            ORDER BY schemaname COLLATE "C", sequencename COLLATE "C"
        `);
        for (const sequence of sequences) {
            const relation = `${quoteIdentifier(sequence.schema)}.${quoteIdentifier(sequence.name)}`;
            const [row] = await transaction.unsafe<{ state: string }[]>(
                `SELECT jsonb_build_array(last_value::text, is_called)::text AS state FROM ${relation}`
            );
            if (!row) throw new Error(`Cannot read sequence ${relation}.`);
            manifest.sequences.push({ ...sequence, state: row.state });
        }
    });
    return manifest;
};

export const assertDatabasePreserved = (before: DatabaseManifest, after: DatabaseManifest) => {
    const parsedBefore = databaseManifestSchema.parse(before);
    const parsedAfter = databaseManifestSchema.parse(after);
    const expected = JSON.stringify({
        tables: parsedBefore.tables,
        sequences: parsedBefore.sequences,
    });
    const actual = JSON.stringify({ tables: parsedAfter.tables, sequences: parsedAfter.sequences });
    if (expected !== actual) {
        throw new Error(
            'Database preservation failed. Table contents, columns, or sequences differ.'
        );
    }
};

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
