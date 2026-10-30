import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/product-schema';
import { keepaHistoryRefreshQueue } from '@/db/schema';
import { getKeepaSpareRefreshCandidates } from '@/services/keepa-scheduled-refresh';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-10-30T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Keepa spare refresh candidates', () => {
    beforeEach(async () => {
        if (process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test') {
            throw new Error('Keepa spare refresh tests require the private loopback database');
        }
        await db.execute(sql`truncate products, keepa_history_refresh_queue cascade`);
    });

    it('takes admitted active Merch fetched over a day ago or never, best BSR first', async () => {
        await db.insert(products).values([
            product('B0SPARE001', { rootCategoryBsr: 2_500_000, keepaFetchedAt: null }),
            product('B0SPARE002', { rootCategoryBsr: 400_000, keepaFetchedAt: hoursAgo(30) }),
            product('B0SPARE003', { rootCategoryBsr: 120_000, keepaFetchedAt: hoursAgo(25) }),
            // Fetched within the day: not spare yet.
            product('B0SPARE004', { rootCategoryBsr: 90_000, keepaFetchedAt: hoursAgo(23) }),
            // Already queued.
            product('B0SPARE005', { rootCategoryBsr: 80_000, keepaFetchedAt: null }),
            // Not admitted, not Merch, unknown classification, inactive, or missing BSR.
            product('B0SPARE006', {
                rootCategoryBsr: 70_000,
                historyAdmissionState: 'notAdmitted',
                historyAdmissionReason: null,
                historyAdmittedAt: null,
            }),
            product('B0SPARE007', { rootCategoryBsr: 60_000, isMerchListing: false }),
            product('B0SPARE008', { rootCategoryBsr: 50_000, isMerchListing: null }),
            product('B0SPARE009', { rootCategoryBsr: 40_000, amazonListingStatus: 'deleted' }),
            product('B0SPARE010', { rootCategoryBsr: null }),
        ]);
        await db.insert(keepaHistoryRefreshQueue).values({ marketplaceId: market, asin: 'B0SPARE005' });

        const candidates = await getKeepaSpareRefreshCandidates({ limit: 10, now });

        expect(asins(candidates)).toEqual(['B0SPARE003', 'B0SPARE002', 'B0SPARE001']);
        expect(asins(await getKeepaSpareRefreshCandidates({ limit: 1, now }))).toEqual([
            'B0SPARE003',
        ]);
    });
});

const asins = (candidates: readonly { asin: string }[]) =>
    candidates.map(candidate => candidate.asin);

const product = (asin: string, overrides: Partial<typeof products.$inferInsert> = {}) => ({
    marketplaceId: market,
    asin,
    isMerchListing: true,
    amazonListingStatus: 'active' as const,
    historyAdmissionState: 'admitted' as const,
    historyAdmissionReason: 'capacity' as const,
    historyAdmittedAt: hoursAgo(48),
    keepaFetchedAt: hoursAgo(48),
    ...overrides,
});
