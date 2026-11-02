import { afterEach, describe, expect, it } from 'bun:test';
import { like } from 'drizzle-orm';
import { db } from '@/db/index';
import { persistKeepaProductRows } from '@/db/product/persist-normalized-keepa-product';
import { productAsinAliases, products } from '@/db/schema';
import { normalizeKeepaProduct } from '@/services/keepa-product-normalizer';

const M = 'ATVPDKIKX0DER';
const describeCatalogDb =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test'
        ? describe
        : describe.skip;

describeCatalogDb('Keepa Product rows for a page', () => {
    afterEach(async () => {
        await db.delete(productAsinAliases).where(like(productAsinAliases.asin, 'B0ROW%'));
        await db.delete(products).where(like(products.asin, 'B0ROW%'));
    });

    it('writes a page in input order and a shared family once', async () => {
        const ids = await db.transaction(tx =>
            persistKeepaProductRows(tx, [
                keepa({ asin: 'B0ROWPLAIN1', title: 'Plain tee' }),
                keepa({ asin: 'B0ROWSMALL1', parentAsin: 'B0ROWPARENT', title: 'Small' }),
                keepa({ asin: 'B0ROWLARGE1', parentAsin: 'B0ROWPARENT', title: 'Large' }),
            ])
        );

        const rows = await db.select().from(products).where(like(products.asin, 'B0ROW%'));
        const byAsin = new Map(rows.map(row => [row.asin, row]));
        expect(rows).toHaveLength(2);
        expect(ids).toEqual([
            byAsin.get('B0ROWPLAIN1')?.id,
            byAsin.get('B0ROWPARENT')?.id,
            byAsin.get('B0ROWPARENT')?.id,
        ]);
        expect(byAsin.get('B0ROWPLAIN1')).toMatchObject({ title: 'Plain tee', brand: 'Rows' });
    });

    it('keeps stored canonical values and takes fresh Keepa metrics on a second page', async () => {
        await db.transaction(tx =>
            persistKeepaProductRows(tx, [keepa({ asin: 'B0ROWPLAIN1', title: 'First title' })])
        );
        const [id] = await db.transaction(tx =>
            persistKeepaProductRows(tx, [
                keepa({ asin: 'B0ROWPLAIN1', title: 'Second title', monthlySold: 300 }),
            ])
        );

        const [row] = await db.select().from(products).where(like(products.asin, 'B0ROWPLAIN1'));
        expect(row).toMatchObject({ id, title: 'First title', keepaMonthlySold: 300 });
    });
});

const keepa = (product: {
    asin: string;
    title: string;
    parentAsin?: string;
    monthlySold?: number;
}) =>
    normalizeKeepaProduct({
        marketplaceId: M,
        product: { brand: 'Rows', csv: [], ...product },
        fetchedAt: new Date('2026-11-02T12:00:00.000Z'),
    });
