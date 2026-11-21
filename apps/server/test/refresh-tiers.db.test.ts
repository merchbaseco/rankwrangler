import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { type ProductStats, readProductStats, refreshProductStats } from '@/db/product-stats';
import { products } from '@/db/product-schema';
import {
    getKeepaRefreshPolicyBuckets,
    getSpApiRefreshPolicyBuckets,
} from '@/services/admin-refresh-policy-buckets';

const market = 'ATVPDKIKX0DER';
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('refresh tiers', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Refresh tier tests require the private loopback database');
        }
        await db.execute(sql`truncate products, product_stats cascade`);
    });
    it('counts only active admitted products as automatic Keepa refresh and explains SPAPI blindspot checks', async () => {
        const now = new Date();
        const admitted = {
            historyAdmissionState: 'admitted' as const,
            historyAdmissionReason: 'capacity' as const,
            historyAdmittedAt: now,
        };
        await db.insert(products).values([
            {
                marketplaceId: market,
                asin: 'B000000001',
                isMerchListing: true,
                rootCategoryBsr: 100_000,
                ...admitted,
            },
            {
                marketplaceId: market,
                asin: 'B000000002',
                isMerchListing: true,
                rootCategoryBsr: 100_000,
            },
            {
                marketplaceId: market,
                asin: 'B000000003',
                isMerchListing: true,
                rootCategoryBsr: 100_000,
                amazonListingStatus: 'deleted',
                ...admitted,
            },
        ]);
        const stats = await count(now);
        const buckets = getKeepaRefreshPolicyBuckets(stats);
        expect(
            buckets
                .filter(bucket => bucket.isAutoRefresh)
                .reduce((sum, bucket) => sum + bucket.count, 0)
        ).toBe(1);
        expect(
            getSpApiRefreshPolicyBuckets(stats).find(bucket => bucket.key === 'nonAutoRefresh')
                ?.hint
        ).toContain('bounded checks');
    });

    it('matches the live tier counts it replaced, tier by tier', async () => {
        const now = new Date();
        const rows: (typeof products.$inferInsert)[] = [];
        for (const bsr of [null, 10_000, 60_000, 250_000, 400_000, 700_000, 1_500_000, 4_000_000]) {
            for (const [index, variant] of [
                'admitted',
                'waiting',
                'deleted',
                'nonMerch',
            ].entries()) {
                rows.push({
                    marketplaceId: market,
                    asin: `B0TIER${String(rows.length).padStart(4, '0')}`,
                    rootCategoryBsr: bsr,
                    isMerchListing: variant !== 'nonMerch',
                    amazonListingStatus: variant === 'deleted' ? 'deleted' : 'active',
                    ...(variant === 'waiting'
                        ? {}
                        : {
                              historyAdmissionState: 'admitted' as const,
                              historyAdmissionReason: 'legacy' as const,
                              historyAdmittedAt: new Date(now.getTime() - index * 1000),
                          }),
                });
            }
        }
        await db.insert(products).values(rows);
        const stats = await count(now);
        const [direct] = await db.execute<Record<string, number>>(sql`select
            count(*) filter (where is_merch_listing and root_category_bsr < 200000)::int lt_200k,
            count(*) filter (where is_merch_listing and root_category_bsr >= 200000 and root_category_bsr < 500000)::int r200_500,
            count(*) filter (where is_merch_listing and root_category_bsr >= 500000 and root_category_bsr < 1000000)::int r500_1m,
            count(*) filter (where is_merch_listing and root_category_bsr >= 1000000 and root_category_bsr < 3000000)::int r1m_3m,
            count(*) filter (where is_merch_listing and root_category_bsr >= 3000000)::int gte_3m,
            count(*) filter (where is_merch_listing = false or root_category_bsr is null)::int non_auto,
            count(*) filter (where is_merch_listing and amazon_listing_status='active' and history_admission_state='admitted' and root_category_bsr < 300000)::int daily,
            count(*) filter (where is_merch_listing and amazon_listing_status='active' and history_admission_state='admitted' and root_category_bsr >= 300000 and root_category_bsr < 600000)::int weekly,
            count(*) filter (where is_merch_listing and amazon_listing_status='active' and history_admission_state='admitted' and root_category_bsr >= 600000 and root_category_bsr < 1000000)::int biweekly,
            count(*) filter (where is_merch_listing and amazon_listing_status='active' and history_admission_state<>'admitted' and root_category_bsr < 300000)::int wait_daily,
            count(*) filter (where is_merch_listing and amazon_listing_status='active' and history_admission_state<>'admitted' and root_category_bsr >= 300000 and root_category_bsr < 600000)::int wait_weekly,
            count(*) filter (where is_merch_listing and amazon_listing_status='active' and history_admission_state<>'admitted' and root_category_bsr >= 600000 and root_category_bsr < 1000000)::int wait_biweekly,
            count(*) filter (where is_merch_listing and root_category_bsr >= 1000000)::int on_demand,
            count(*) filter (where is_merch_listing and root_category_bsr is null)::int missing_bsr,
            count(*) filter (where is_merch_listing = false)::int non_merch
            from products`);
        const counts = (list: { key: string; count: number }[]) =>
            Object.fromEntries(list.map(bucket => [bucket.key, bucket.count]));
        expect(counts(getSpApiRefreshPolicyBuckets(stats))).toEqual({
            lt200k: direct.lt_200k,
            '200kTo500k': direct.r200_500,
            '500kTo1m': direct.r500_1m,
            '1mTo3m': direct.r1m_3m,
            gte3m: direct.gte_3m,
            nonAutoRefresh: direct.non_auto,
        });
        const keepaBuckets = getKeepaRefreshPolicyBuckets(stats);
        expect(counts(keepaBuckets)).toEqual({
            daily: direct.daily,
            weekly: direct.weekly,
            biweekly: direct.biweekly,
            onDemand: direct.on_demand,
            merchMissingBsr: direct.missing_bsr,
            nonMerch: direct.non_merch,
        });
        expect(Object.fromEntries(keepaBuckets.map(bucket => [bucket.key, bucket.waiting]))).toEqual({
            daily: direct.wait_daily,
            weekly: direct.wait_weekly,
            biweekly: direct.wait_biweekly,
            onDemand: 0,
            merchMissingBsr: 0,
            nonMerch: 0,
        });
        expect(direct.daily).toBe(3);
    });
});

const count = async (now: Date): Promise<ProductStats> => {
    await db.transaction(tx => refreshProductStats(tx, now));
    const stats = await readProductStats();
    if (!stats) throw new Error('Expected a Product count');
    return stats;
};
