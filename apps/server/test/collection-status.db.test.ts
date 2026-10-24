import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { catalogQueries } from '@/db/catalog-search-schema';
import { db } from '@/db/index';
import { keywordDiscoveryAttempts, keywordExplorationPasses } from '@/db/keyword-collection-schema';
import { products } from '@/db/product-schema';
import {
    getKeepaRefreshPolicyBuckets,
    getSpApiRefreshPolicyBuckets,
} from '@/services/admin-refresh-policy-buckets';
import { getCollectionStatus } from '@/services/collection-status';

const market = 'ATVPDKIKX0DER';
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('operator collection status', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Collection tests require the private loopback database');
        }
        await db.execute(
            sql`truncate products, catalog_queries, keepa_capacity_state, keepa_capacity_attempts cascade`
        );
    });
    it('reports persisted admissions, overdue work, keyword coverage and reserved discovery attempts', async () => {
        const now = new Date();
        const old = new Date(now.getTime() - 9 * 86_400_000);
        await db.insert(products).values([
            {
                marketplaceId: market,
                asin: 'B000000001',
                title: 'Fishing',
                isMerchListing: true,
                rootCategoryBsr: 100_000,
                historyAdmissionState: 'admitted',
                historyAdmissionReason: 'capacity',
                historyAdmittedAt: old,
                createdAt: old,
            },
            {
                marketplaceId: market,
                asin: 'B000000002',
                title: 'Paused',
                isMerchListing: true,
                rootCategoryBsr: 100_000,
                historyAdmissionState: 'paused',
                historyAdmissionReason: 'capacity',
            },
        ]);
        const [query] = await db
            .insert(catalogQueries)
            .values({
                source: 'keepa',
                marketplaceId: market,
                normalizedTerm: 'fishing',
                displayTerm: 'fishing',
                tier: 'warm',
                admittedAt: old,
                nextDueAt: old,
            })
            .returning();
        const [pass] = await db
            .insert(keywordExplorationPasses)
            .values({
                queryId: query.id,
                nextPageToken: 'private-provider-pagination-token',
                resumeAt: old,
            })
            .returning();
        await db
            .insert(keywordDiscoveryAttempts)
            .values({ queryId: query.id, passId: pass.id, page: 0, attemptedAt: now });
        const snapshot = await getCollectionStatus();
        expect(snapshot.keepa.fresh).toBe(false);
        expect(snapshot.history.admissions).toEqual([
            { state: 'admitted', products: 1, automaticEligible: 1 },
            { state: 'paused', products: 1, automaticEligible: 0 },
        ]);
        expect(snapshot.history.overload).toMatchObject({
            overdueCount: 1,
            newAdmissionsPaused: true,
        });
        expect(snapshot.keywords).toEqual([
            { tier: 'warm', keywords: 1, admitted: 1, due: 1, neverObserved: 1 },
        ]);
        expect(snapshot.exploration.passes).toEqual([{ reason: 'running', passes: 1, ready: 1 }]);
        expect(snapshot.exploration.attempts24h).toEqual([{ status: 'reserved', attempts: 1 }]);
        expect(JSON.stringify(snapshot)).not.toContain('private-provider-pagination-token');
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
                ?.refreshEveryLabel
        ).toContain('bounded checks');
    });
});
