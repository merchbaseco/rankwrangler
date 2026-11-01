import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { MERCH_ROOT_CATEGORY_ID, readSalesCurveObservations } from '@/db/sales-curve-observations';
import { products } from '@/db/schema';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-11-01T15:00:00Z');
const DAY = 86_400_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Sales curve observations', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Sales curve tests require the private loopback test database.');
        }
        await db.execute(sql`truncate products cascade`);
    });

    it('counts badges against the 30-day rank for recently read Merch shirts only', async () => {
        await insertProduct('B0CURVE001', { keepaMonthlySold: 100 });
        await insertProduct('B0CURVE002', { keepaMonthlySold: null });
        await insertProduct('B0CURVE003', { keepaMonthlySold: 100 });
        await insertProduct('B0STALE001', { keepaFetchedAt: new Date(now.getTime() - 40 * DAY) });
        await insertProduct('B0UNREAD01', { keepaFetchedAt: null });
        await insertProduct('B0NOTMERCH', { isMerchListing: false });
        await insertProduct('B0TOYS0001', { rootCategoryId: 165_793_011 });
        await insertProduct('B0NOAVG001', { keepaBsrAverage30: null });
        await insertProduct('B0DELETED1', { amazonListingStatus: 'deleted' });

        const observations = await readSalesCurveObservations(market, now);
        const badged = observations.find(row => row.sold === 100);
        expect(observations.reduce((sum, row) => sum + row.count, 0)).toBe(3);
        expect(badged?.count).toBe(2);
        expect(observations.find(row => row.sold === null)?.count).toBe(1);
        // Bins are an eighth of ln(BSR) wide, so a bin's rank sits within 6.5% of the real one.
        expect(Math.abs(Math.log((badged?.bsr ?? 0) / 300_000))).toBeLessThan(1 / 16);
    });
});

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    await db.insert(products).values({
        marketplaceId: market,
        asin,
        title: 'Curve shirt',
        isMerchListing: true,
        rootCategoryId: MERCH_ROOT_CATEGORY_ID,
        rootCategoryBsr: 280_000,
        keepaBsrAverage30: 300_000,
        keepaFetchedAt: new Date(now.getTime() - 2 * DAY),
        keepaMonthlySold: 50,
        ...extra,
    });
};
