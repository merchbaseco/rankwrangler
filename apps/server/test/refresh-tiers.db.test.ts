import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
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
        await db.execute(sql`truncate products cascade`);
    });
    it('counts only active admitted products as automatic Keepa refresh and explains SPAPI blindspot checks', async () => {
        const now = new Date();
        await db.insert(products).values([
            {
                marketplaceId: market,
                asin: 'B000000001',
                isMerchListing: true,
                rootCategoryBsr: 100_000,
                historyAdmissionState: 'admitted',
                historyAdmissionReason: 'capacity',
                historyAdmittedAt: now,
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
                historyAdmissionState: 'admitted',
                historyAdmissionReason: 'capacity',
                historyAdmittedAt: now,
            },
        ]);
        const buckets = await getKeepaRefreshPolicyBuckets();
        expect(
            buckets
                .filter(bucket => bucket.isAutoRefresh)
                .reduce((sum, bucket) => sum + bucket.count, 0)
        ).toBe(1);
        expect(
            (await getSpApiRefreshPolicyBuckets()).find(bucket => bucket.key === 'nonAutoRefresh')
                ?.hint
        ).toContain('bounded checks');
    });
});
