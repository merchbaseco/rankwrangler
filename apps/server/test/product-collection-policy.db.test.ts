import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { readProductStats, refreshProductStats } from '@/db/product-stats';
import { products } from '@/db/schema';
import { admitProductHistory } from '@/services/product-history-admission';
import { getHistoryAdmissionOverload } from '@/services/product-history-overload';
import { shouldKeepaHistoryRefreshAsin } from '@/services/product-history-eligibility';
import { listDueSpApiBlindspots } from '@/services/spapi-refresh-selection';

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
        await db.execute(sql`truncate products, product_stats cascade`);
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
        await count(now);
        const result = await admitProductHistory({ refillRate: 0.001, productCost: 1 }, now);
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
        await count(now);
        expect((await admitProductHistory(null, now)).admitted).toBe(0);
        await db
            .update(products)
            .set({
                historyAdmissionState: 'admitted',
                historyAdmissionReason: 'legacy',
                historyAdmittedAt: new Date('2026-10-15T12:00:00Z'),
            })
            .where(eq(products.asin, 'B000000001'));
        await insert('B000000002');
        await count(now);
        const result = await admitProductHistory({ refillRate: 20, productCost: 1 }, now);
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
        await insert('B000000002', {
            historyAdmissionState: 'admitted',
            historyAdmissionReason: 'legacy',
            historyAdmittedAt: new Date('2026-10-20T12:00:00Z'),
            keepaFetchedAt: new Date('2026-10-22T13:00:00Z'),
        });
        await count(now);
        const stats = await readProductStats();
        if (!stats) throw new Error('Expected a Product count');
        expect(getHistoryAdmissionOverload(stats, now)).toEqual({
            overdueCount: 1,
            oldestOverdueAt: new Date('2026-10-16T12:00:00Z'),
            newAdmissionsPaused: true,
        });
        expect(getHistoryAdmissionOverload(stats, now)).toEqual(await readOverloadDirectly(now));
    });

    it('observes no-BSR Merch on probation and cold intervals, and Keepa-only non-Merch once', async () => {
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
        await insert('B000000008', { isMerchListing: false, spApiFetchedAt: daysAgo(60) });
        const rows = await listDueSpApiBlindspots(now);
        expect(rows.map(row => row.asin).sort()).toEqual([
            'B000000001',
            'B000000005',
            'B000000007',
        ]);
    });
});

const count = (at: Date) => db.transaction(tx => refreshProductStats(tx, at));

// The live query the stored overload replaced, kept as the reference.
const readOverloadDirectly = async (at: Date) => {
    const [row] = await db.execute<{ overdue: number; oldest: string | null }>(sql`
        with due as (
            select coalesce(keepa_fetched_at + case when root_category_bsr < 300000
                then interval '1 day' else interval '7 days' end, history_admitted_at, created_at) due_at
            from products where history_admission_state='admitted' and amazon_listing_status='active'
                and is_merch_listing and root_category_bsr < 1000000
        ) select count(*) filter (where due_at <= ${at.toISOString()}::timestamp)::int overdue,
            min(due_at) filter (where due_at <= ${at.toISOString()}::timestamp)::text oldest from due`);
    const oldestOverdueAt = row.oldest ? new Date(`${row.oldest}Z`) : null;
    return {
        overdueCount: row.overdue,
        oldestOverdueAt,
        newAdmissionsPaused:
            oldestOverdueAt !== null && at.getTime() - oldestOverdueAt.getTime() >= 7 * 86_400_000,
    };
};

const insert = (asin: string, overrides: Partial<typeof products.$inferInsert> = {}) =>
    db.insert(products).values({
        marketplaceId: market,
        asin,
        isMerchListing: true,
        rootCategoryBsr: 100_000,
        createdAt: new Date('2026-10-01T12:00:00Z'),
        ...overrides,
    });
