import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, like } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    products,
    topSearchTermsDatasets,
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
} from '@/db/schema';
import { CATALOG_QUERY_REFRESH_INTERVAL_MS } from '@/services/catalog-query-refresh-policy';
import {
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
} from '@/services/keepa-refresh-policy';
import {
    CATALOG_QUERIES_SCHEDULER_LAG_MS,
    dueBefore,
    KEEPA_HISTORY_SCHEDULER_LAG_MS,
    SPAPI_CATALOG_SCHEDULER_LAG_MS,
    TOP_SEARCH_TERMS_SCHEDULER_LAG_MS,
} from '@/services/service-health';
import {
    probeCatalogQueries,
    probeKeepaHistory,
    probeSpapiCatalog,
    probeTopSearchTerms,
} from '@/services/service-health-queries';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { REFRESH_AFTER_24_HOURS_MS } from '@/services/spapi-refresh-policy';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const LOW_BSR = 50_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('service health query probes', () => {
    beforeEach(async () => {
        await db.delete(products).where(like(products.asin, 'B0HLTH%'));
        await db
            .delete(catalogQueries)
            .where(like(catalogQueries.normalizedTerm, 'health-probe-%'));
        await db
            .delete(topSearchTermsKeywordDaily)
            .where(eq(topSearchTermsKeywordDaily.marketplaceId, SPAPI_US_MARKETPLACE_ID));
        await db
            .delete(topSearchTermsSnapshots)
            .where(eq(topSearchTermsSnapshots.marketplaceId, SPAPI_US_MARKETPLACE_ID));
        await db
            .delete(topSearchTermsDatasets)
            .where(eq(topSearchTermsDatasets.marketplaceId, SPAPI_US_MARKETPLACE_ID));
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
    it('fails an active catalog query whose success is older than the interval plus grace', async () => {
        await insertCatalogQuery({
            activeUntil: minutesAfter(NOW, 60),
            latestSuccessfulRunAt: minutesBefore(catalogSuccessDueAt()),
            nextRefreshAttemptAt: minutesAfter(NOW, 60),
            term: 'health-probe-stale',
        });

        expect(await probeCatalogQueries(NOW)).toBe(true);
    });
    it('passes an active catalog query created recently with no success yet', async () => {
        await insertCatalogQuery({
            activeUntil: minutesAfter(NOW, 60),
            createdAt: new Date(NOW.getTime() - MINUTE_MS),
            latestSuccessfulRunAt: null,
            term: 'health-probe-new',
        });

        expect(await probeCatalogQueries(NOW)).toBe(false);
    });
    it('passes an inactive catalog query', async () => {
        await insertCatalogQuery({
            activeUntil: minutesBefore(NOW),
            latestSuccessfulRunAt: minutesBefore(catalogSuccessDueAt()),
            term: 'health-probe-inactive',
        });

        expect(await probeCatalogQueries(NOW)).toBe(false);
    });
    it('passes when no catalog query is overdue', async () => {
        expect(await probeCatalogQueries(NOW)).toBe(false);
    });
    it('fails when the US top search terms table is empty', async () => {
        expect(await probeTopSearchTerms(NOW)).toBe(true);
    });
    it('passes a closed US top search terms window', async () => {
        await insertDataset({
            nextRefreshAt: null,
            status: 'completed',
        });

        expect(await probeTopSearchTerms(NOW)).toBe(false);
    });
    it('fails a US top search terms row whose next_refresh_at is older than the grace', async () => {
        await insertDataset({
            nextRefreshAt: minutesBefore(topSearchTermsDueAt()),
            status: 'completed',
        });

        expect(await probeTopSearchTerms(NOW)).toBe(true);
    });
    it('fails a US top search terms row that has been failed longer than the grace', async () => {
        await insertDataset({
            lastCompletedAt: null,
            lastFailedAt: minutesBefore(topSearchTermsDueAt()),
            nextRefreshAt: minutesAfter(NOW, 30),
            status: 'failed',
        });

        expect(await probeTopSearchTerms(NOW)).toBe(true);
    });
    it('passes a US top search terms failure newer than the grace', async () => {
        await insertDataset({
            lastCompletedAt: null,
            lastFailedAt: new Date(NOW.getTime() - MINUTE_MS),
            nextRefreshAt: minutesAfter(NOW, 30),
            status: 'failed',
        });

        expect(await probeTopSearchTerms(NOW)).toBe(false);
    });
});

const minutesBefore = (date: Date, minutes = 1) => new Date(date.getTime() - minutes * MINUTE_MS);

const minutesAfter = (date: Date, minutes = 1) => new Date(date.getTime() + minutes * MINUTE_MS);

const spapiLowBsrDueAt = () =>
    dueBefore(NOW, REFRESH_AFTER_24_HOURS_MS, SPAPI_CATALOG_SCHEDULER_LAG_MS);

const keepaCreatedDueAt = () => dueBefore(NOW, 0, KEEPA_HISTORY_SCHEDULER_LAG_MS);

const keepaDailyFetchedDueAt = () =>
    dueBefore(NOW, KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS, KEEPA_HISTORY_SCHEDULER_LAG_MS);

const catalogSuccessDueAt = () =>
    dueBefore(NOW, CATALOG_QUERY_REFRESH_INTERVAL_MS, CATALOG_QUERIES_SCHEDULER_LAG_MS);

const topSearchTermsDueAt = () => dueBefore(NOW, 0, TOP_SEARCH_TERMS_SCHEDULER_LAG_MS);

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

const insertCatalogQuery = async ({
    term,
    activeUntil,
    createdAt = NOW,
    latestSuccessfulRunAt,
    nextRefreshAttemptAt = null,
}: {
    term: string;
    activeUntil: Date | null;
    createdAt?: Date;
    latestSuccessfulRunAt: Date | null;
    nextRefreshAttemptAt?: Date | null;
}) => {
    await db.insert(catalogQueries).values({
        activeUntil,
        createdAt,
        displayTerm: term,
        latestSuccessfulRunAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        nextRefreshAttemptAt,
        normalizedTerm: term,
        page: 0,
        source: 'keepa',
    });
};

const insertDataset = async ({
    lastCompletedAt = null,
    lastFailedAt = null,
    nextRefreshAt,
    status,
}: {
    lastCompletedAt?: Date | null;
    lastFailedAt?: Date | null;
    nextRefreshAt: Date | null;
    status: string;
}) => {
    await db.insert(topSearchTermsDatasets).values({
        dataEndDate: '2026-08-01',
        dataStartDate: '2026-08-01',
        lastCompletedAt,
        lastFailedAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        nextRefreshAt,
        reportPeriod: 'DAY',
        status,
    });
};
