import { describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { productSearchDocument } from '@/db/product-search-document';

const document = productSearchDocument({
    title: sql`title`,
    brand: sql`brand`,
    bullet1: sql`bullet_1`,
    bullet2: sql`bullet_2`,
});

const samples = sql`
    WITH samples(id, title, brand, bullet_1, bullet_2) AS (VALUES
        (1, 'Fishing shirt', NULL, NULL, NULL),
        (2, 'Garden shirt', 'Fishing Outfitters', NULL, NULL),
        (3, 'Garden shirt', NULL, 'I love fishing', NULL),
        (4, NULL, NULL, NULL, NULL),
        (5, 'Fish club', NULL, NULL, NULL),
        (6, 'Bass fishing', NULL, NULL, NULL)
    )
`;

const matchingIds = async (query: string) => {
    const rows = await db.execute<{ id: number }>(sql`
        ${samples}
        SELECT id FROM samples
        WHERE (${document}) @@ to_tsquery('simple', ${query})
        ORDER BY ts_rank((${document}), to_tsquery('simple', ${query})) DESC, id ASC
    `);
    return rows.map(row => row.id);
};

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'Product search document in PostgreSQL',
    () => {
        it('ranks title before brand before bullets, preserving unknown fields', async () => {
            expect(await matchingIds('fishing')).toEqual([1, 6, 2, 3]);
        });

        it('supports explicit exclusions without silently broadening word matches', async () => {
            expect(await matchingIds('fishing & !bass')).toEqual([1, 2, 3]);
            expect(await matchingIds('fish')).toEqual([5]);
        });

        it('keeps a missing word empty', async () => {
            expect(await matchingIds('zzzxqvnotaword')).toEqual([]);
        });
    }
);
