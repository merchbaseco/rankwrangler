import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, like } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    topSearchTermsDatasets,
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
} from '@/db/schema';
import { CATALOG_QUERY_REFRESH_INTERVAL_MS } from '@/services/catalog-query-refresh-policy';
import {
    CATALOG_QUERIES_SCHEDULER_LAG_MS,
    dueBefore,
    TOP_SEARCH_TERMS_SCHEDULER_LAG_MS,
} from '@/services/service-health';
import { probeCatalogQueries, probeTopSearchTerms } from '@/services/service-health-queries';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('service health schedule probes', () => {
    beforeEach(async () => {
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

const catalogSuccessDueAt = () =>
    dueBefore(NOW, CATALOG_QUERY_REFRESH_INTERVAL_MS, CATALOG_QUERIES_SCHEDULER_LAG_MS);

const topSearchTermsDueAt = () => dueBefore(NOW, 0, TOP_SEARCH_TERMS_SCHEDULER_LAG_MS);

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
