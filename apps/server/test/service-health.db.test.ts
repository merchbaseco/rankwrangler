import { beforeEach, describe, expect, it } from 'bun:test';
import { like } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import {
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
} from '@/services/keepa-refresh-policy';
import {
    dueBefore,
    KEEPA_HISTORY_SCHEDULER_LAG_MS,
    SPAPI_CATALOG_SCHEDULER_LAG_MS,
} from '@/services/service-health';
import { probeKeepaHistory, probeSpapiCatalog } from '@/services/service-health-queries';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { REFRESH_AFTER_24_HOURS_MS } from '@/services/spapi-refresh-policy';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const LOW_BSR = 50_000;
const WEEKLY_BSR = 500_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('service health product probes', () => {
    beforeEach(async () => {
        await db.delete(products).where(like(products.asin, 'B0HLTH%'));
    });

    it('ignores one overdue SP-API product and fails on a second', async () => {
        const overdue = {
            rootCategoryBsr: LOW_BSR,
            spApiFetchedAt: minutesBefore(spapiLowBsrDueAt()),
        };
        await insertProduct({ asin: 'B0HLTHSP01', ...overdue });
        expect(await probeSpapiCatalog(NOW)).toBe(false);
        await insertProduct({ asin: 'B0HLTHSP11', ...overdue });
        expect(await probeSpapiCatalog(NOW)).toBe(true);
    });
    it('passes a low-BSR fetch one minute inside the tier plus grace', async () => {
        await insertProduct({
            asin: 'B0HLTHSP02',
            rootCategoryBsr: LOW_BSR,
            spApiFetchedAt: minutesAfter(spapiLowBsrDueAt()),
        });

        expect(await probeSpapiCatalog(NOW)).toBe(false);
    });
    it('passes a null sp_api_fetched_at', async () => {
        await insertProduct({
            asin: 'B0HLTHSP03',
            rootCategoryBsr: LOW_BSR,
            spApiFetchedAt: null,
        });

        expect(await probeSpapiCatalog(NOW)).toBe(false);
    });
    it('passes a deleted listing', async () => {
        await insertProduct({
            asin: 'B0HLTHSP04',
            amazonListingStatus: 'deleted',
            rootCategoryBsr: LOW_BSR,
            spApiFetchedAt: minutesBefore(spapiLowBsrDueAt()),
        });

        expect(await probeSpapiCatalog(NOW)).toBe(false);
    });
    it('passes when no product is overdue for SP-API', async () => {
        expect(await probeSpapiCatalog(NOW)).toBe(false);
    });
    it('ignores one never-fetched Keepa product and fails on a second', async () => {
        const overdue = {
            createdAt: minutesBefore(keepaCreatedDueAt()),
            keepaFetchedAt: null,
            rootCategoryBsr: LOW_BSR,
        };
        await insertProduct({ asin: 'B0HLTHKP01', ...overdue });
        expect(await probeKeepaHistory(NOW)).toBe(false);
        await insertProduct({ asin: 'B0HLTHKP11', ...overdue });
        expect(await probeKeepaHistory(NOW)).toBe(true);
    });
    it('passes an eligible never-fetched product with a recent created_at', async () => {
        await insertProduct({
            asin: 'B0HLTHKP02',
            createdAt: new Date(NOW.getTime() - MINUTE_MS),
            keepaFetchedAt: null,
            rootCategoryBsr: LOW_BSR,
        });

        expect(await probeKeepaHistory(NOW)).toBe(false);
    });
    it('passes a product at or above the weekly BSR threshold', async () => {
        await insertProduct({
            asin: 'B0HLTHKP03',
            createdAt: minutesBefore(keepaCreatedDueAt()),
            keepaFetchedAt: null,
            rootCategoryBsr: KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
        });

        expect(await probeKeepaHistory(NOW)).toBe(false);
    });
    it('ignores one stale Keepa fetch and fails on a second', async () => {
        const overdue = {
            keepaFetchedAt: minutesBefore(keepaDailyFetchedDueAt()),
            rootCategoryBsr: LOW_BSR,
        };
        await insertProduct({ asin: 'B0HLTHKP04', ...overdue });
        expect(await probeKeepaHistory(NOW)).toBe(false);
        await insertProduct({ asin: 'B0HLTHKP14', ...overdue });
        expect(await probeKeepaHistory(NOW)).toBe(true);
    });
    it('passes an old Keepa fetch just promoted into the daily tier', async () => {
        const promoted = {
            keepaFetchedAt: new Date(keepaDailyFetchedDueAt().getTime() - 2 * DAY_MS),
            rootCategoryBsr: LOW_BSR,
            spApiFetchedAt: new Date(NOW.getTime() - 10 * MINUTE_MS),
        };
        await insertProduct({ asin: 'B0HLTHKP05', ...promoted });
        await insertProduct({ asin: 'B0HLTHKP15', ...promoted });

        expect(await probeKeepaHistory(NOW)).toBe(false);
    });
    it('fails a daily promotion older than the scheduler lag and still not fetched', async () => {
        const promoted = {
            keepaFetchedAt: new Date(keepaDailyFetchedDueAt().getTime() - 2 * DAY_MS),
            rootCategoryBsr: LOW_BSR,
            spApiFetchedAt: minutesBefore(keepaCreatedDueAt()),
        };
        await insertProduct({ asin: 'B0HLTHKP06', ...promoted });
        await insertProduct({ asin: 'B0HLTHKP16', ...promoted });

        expect(await probeKeepaHistory(NOW)).toBe(true);
    });
    it('passes an on-demand product just promoted into the weekly tier', async () => {
        const promoted = {
            createdAt: new Date(keepaCreatedDueAt().getTime() - DAY_MS),
            keepaFetchedAt: null,
            rootCategoryBsr: WEEKLY_BSR,
            spApiFetchedAt: new Date(NOW.getTime() - 10 * MINUTE_MS),
        };
        await insertProduct({ asin: 'B0HLTHKP07', ...promoted });
        await insertProduct({ asin: 'B0HLTHKP17', ...promoted });

        expect(await probeKeepaHistory(NOW)).toBe(false);
    });
});

const minutesBefore = (date: Date, minutes = 1) => new Date(date.getTime() - minutes * MINUTE_MS);

const minutesAfter = (date: Date, minutes = 1) => new Date(date.getTime() + minutes * MINUTE_MS);

const spapiLowBsrDueAt = () =>
    dueBefore(NOW, REFRESH_AFTER_24_HOURS_MS, SPAPI_CATALOG_SCHEDULER_LAG_MS);

const keepaCreatedDueAt = () => dueBefore(NOW, 0, KEEPA_HISTORY_SCHEDULER_LAG_MS);

const keepaDailyFetchedDueAt = () =>
    dueBefore(NOW, KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS, KEEPA_HISTORY_SCHEDULER_LAG_MS);

const insertProduct = async ({
    asin,
    amazonListingStatus = 'active',
    createdAt = NOW,
    keepaFetchedAt,
    rootCategoryBsr,
    spApiFetchedAt,
}: {
    asin: string;
    amazonListingStatus?: 'active' | 'deleted';
    createdAt?: Date;
    keepaFetchedAt?: Date | null;
    rootCategoryBsr: number;
    spApiFetchedAt?: Date | null;
}) => {
    await db.insert(products).values({
        amazonListingStatus,
        asin,
        createdAt,
        isMerchListing: true,
        keepaFetchedAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        rootCategoryBsr,
        spApiFetchedAt,
    });
};
