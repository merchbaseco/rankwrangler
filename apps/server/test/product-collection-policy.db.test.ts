import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { admitProductHistory } from '@/services/product-history-admission';
import { getHistoryAdmissionOverloadSnapshot } from '@/services/product-history-overload';
import { shouldKeepaHistoryRefreshAsin } from '@/services/product-history-eligibility';
import { buildSpApiBlindspotRefreshCondition } from '@/services/spapi-blindspot-selection';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-10-23T12:00:00Z');

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('product collection admission', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Collection tests require the private loopback database.');
        }
        await db.execute(sql`truncate products cascade`);
    });

    it('defaults new identities to no standing history, including incidental fresh history', async () => {
        await insert('B000000001', { keepaFetchedAt: now });
        const [product] = await db.select().from(products);
        expect(product.historyAdmissionState).toBe('notAdmitted');
        expect(product.historyAdmittedAt).toBeNull();
        expect(
            await shouldKeepaHistoryRefreshAsin({ marketplaceId: market, asin: product.asin })
        ).toEqual({ shouldRefresh: false, reason: 'not_admitted' });
    });

    it('admits only the affordable cohort and records capacity pauses', async () => {
        await insert('B000000001');
        await insert('B000000002', { createdAt: new Date('2026-10-02T12:00:00Z') });
        const result = await admitProductHistory({
            refillRate: 0.001,
            productCost: 1,
            newAdmissionsPaused: false,
        });
        expect(result.admitted).toBe(1);
        expect(result.paused).toBe(1);
        const rows = await db.select().from(products).orderBy(products.asin);
        expect(rows.map(row => row.historyAdmissionState)).toEqual(['admitted', 'paused']);
        expect(rows[0].historyAdmissionReason).toBe('capacity');
        expect(rows[0].historyAdmittedAt).toBeInstanceOf(Date);
        expect(rows[1].historyAdmittedAt).toBeNull();
    });

    it('unknown capacity never admits and overload preserves existing admissions', async () => {
        await insert('B000000001');
        expect((await admitProductHistory(null)).admitted).toBe(0);
        await db
            .update(products)
            .set({
                historyAdmissionState: 'admitted',
                historyAdmissionReason: 'legacy',
                historyAdmittedAt: now,
            })
            .where(eq(products.asin, 'B000000001'));
        await insert('B000000002');
        const result = await admitProductHistory({
            refillRate: 20,
            productCost: 1,
            newAdmissionsPaused: true,
        });
        expect(result.admitted).toBe(0);
        expect(result.paused).toBe(1);
        const rows = await db.select().from(products).orderBy(products.asin);
        expect(rows.map(row => row.historyAdmissionState)).toEqual(['admitted', 'paused']);
    });

    it('pauses new admissions when existing eligible history is seven days overdue', async () => {
        await insert('B000000001', {
            historyAdmissionState: 'admitted',
            historyAdmissionReason: 'legacy',
            historyAdmittedAt: new Date('2026-10-01T12:00:00Z'),
            keepaFetchedAt: new Date('2026-10-15T12:00:00Z'),
        });
        const snapshot = await getHistoryAdmissionOverloadSnapshot(now);
        expect(snapshot).toEqual({
            overdueCount: 1,
            oldestOverdueAt: new Date('2026-10-16T12:00:00Z'),
            newAdmissionsPaused: true,
        });
    });

    it('observes first no-BSR, later probation, unknown and cold intervals without sweeping deleted/non-Merch', async () => {
        const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
        await insert('B000000001', {
            rootCategoryBsr: null,
            createdAt: daysAgo(4),
            spApiFetchedAt: daysAgo(4),
        });
        await insert('B000000002', {
            rootCategoryBsr: null,
            createdAt: daysAgo(10),
            spApiFetchedAt: daysAgo(6),
        });
        await insert('B000000003', {
            isMerchListing: null,
            createdAt: daysAgo(10),
            spApiFetchedAt: daysAgo(8),
        });
        await insert('B000000004', {
            isMerchListing: null,
            createdAt: daysAgo(60),
            spApiFetchedAt: daysAgo(20),
        });
        await insert('B000000005', {
            rootCategoryBsr: null,
            createdAt: daysAgo(60),
            spApiFetchedAt: daysAgo(31),
        });
        await insert('B000000006', {
            rootCategoryBsr: null,
            amazonListingStatus: 'deleted',
            spApiFetchedAt: null,
        });
        await insert('B000000007', { isMerchListing: false, spApiFetchedAt: null });
        const rows = await db
            .select({ asin: products.asin })
            .from(products)
            .where(buildSpApiBlindspotRefreshCondition(now))
            .orderBy(products.asin);
        expect(rows.map(row => row.asin)).toEqual(['B000000001', 'B000000003', 'B000000005']);
    });
});

const insert = (asin: string, overrides: Partial<typeof products.$inferInsert> = {}) =>
    db.insert(products).values({
        marketplaceId: market,
        asin,
        isMerchListing: true,
        rootCategoryBsr: 100_000,
        createdAt: new Date('2026-10-01T12:00:00Z'),
        ...overrides,
    });
