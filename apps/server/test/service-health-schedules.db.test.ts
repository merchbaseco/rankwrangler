import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, like } from 'drizzle-orm';
import { db } from '@/db/index';
import { operations } from '@/db/ops-schema';
import { releaseCatalogSearchWork } from '@/db/catalog-search-operations';
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
import { TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS } from '@/services/top-search-terms-report-state-machine';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'service health schedule probes',
    () => {
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
                failureCount: 1,
            });

            expect(await probeCatalogQueries(NOW)).toBe(true);
        });
        it('passes a budget deferral without treating it as a successful observation', async () => {
            await insertCatalogQuery({
                activeUntil: minutesAfter(NOW, 60),
                latestSuccessfulRunAt: minutesBefore(catalogSuccessDueAt()),
                term: 'health-probe-budget',
            });
            const [query] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.normalizedTerm, 'health-probe-budget'));
            const [operation] = await db
                .insert(operations)
                .values({
                    type: 'catalogSearch',
                    targetKey: query.id,
                    input: { queryId: query.id },
                    startedAt: NOW,
                })
                .returning();
            try {
                await releaseCatalogSearchWork(
                    operation.id,
                    minutesBefore(NOW),
                    minutesAfter(NOW, 1)
                );
                expect(await probeCatalogQueries(NOW)).toBe(true);
                await releaseCatalogSearchWork(operation.id, NOW, minutesAfter(NOW, 1));
                expect(await probeCatalogQueries(NOW)).toBe(false);
                expect(await probeCatalogQueries(minutesAfter(NOW, 17))).toBe(true);
                const [deferred] = await db
                    .select()
                    .from(catalogQueries)
                    .where(eq(catalogQueries.id, query.id));
                expect(deferred.failureCount).toBe(0);
                expect(deferred.latestSuccessfulRunAt).toEqual(query.latestSuccessfulRunAt);
            } finally {
                await db.delete(operations).where(eq(operations.id, operation.id));
            }
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
        it('keeps a requested Amazon report healthy until the pending ceiling', async () => {
            await insertDataset({
                nextRefreshAt: minutesBefore(topSearchTermsDueAt()),
                reportId: 'pending-report',
                reportRequestedAt: new Date(topSearchTermsPendingCeiling().getTime() + 1),
                status: 'in_progress',
            });
            expect(await probeTopSearchTerms(NOW)).toBe(false);

            await replaceDataset({
                nextRefreshAt: minutesAfter(NOW, 15),
                reportId: 'expired-pending-report',
                reportRequestedAt: topSearchTermsPendingCeiling(),
                status: 'in_progress',
            });
            expect(await probeTopSearchTerms(NOW)).toBe(true);

            await replaceDataset({
                nextRefreshAt: minutesBefore(topSearchTermsDueAt()),
                reportId: null,
                reportRequestedAt: null,
                status: 'idle',
            });
            expect(await probeTopSearchTerms(NOW)).toBe(true);
        });
    }
);

const minutesBefore = (date: Date, minutes = 1) => new Date(date.getTime() - minutes * MINUTE_MS);

const minutesAfter = (date: Date, minutes = 1) => new Date(date.getTime() + minutes * MINUTE_MS);

const catalogSuccessDueAt = () =>
    dueBefore(NOW, CATALOG_QUERY_REFRESH_INTERVAL_MS, CATALOG_QUERIES_SCHEDULER_LAG_MS);

const topSearchTermsDueAt = () => dueBefore(NOW, 0, TOP_SEARCH_TERMS_SCHEDULER_LAG_MS);

const topSearchTermsPendingCeiling = () =>
    new Date(NOW.getTime() - TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS);

const insertCatalogQuery = async ({
    term,
    activeUntil,
    createdAt = NOW,
    latestSuccessfulRunAt,
    nextRefreshAttemptAt = null,
    failureCount = 0,
}: {
    term: string;
    activeUntil: Date | null;
    createdAt?: Date;
    latestSuccessfulRunAt: Date | null;
    nextRefreshAttemptAt?: Date | null;
    failureCount?: number;
}) => {
    await db.insert(catalogQueries).values({
        activeUntil,
        failureCount,
        tier: activeUntil && activeUntil > NOW ? 'warm' : 'stored',
        nextDueAt: latestSuccessfulRunAt
            ? new Date(latestSuccessfulRunAt.getTime() + CATALOG_QUERY_REFRESH_INTERVAL_MS)
            : createdAt,
        createdAt,
        displayTerm: term,
        latestSuccessfulRunAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        nextRefreshAttemptAt,
        normalizedTerm: term,
        source: 'keepa',
    });
};

const replaceDataset = async (dataset: Parameters<typeof insertDataset>[0]) => {
    await db
        .delete(topSearchTermsDatasets)
        .where(eq(topSearchTermsDatasets.marketplaceId, SPAPI_US_MARKETPLACE_ID));
    await insertDataset(dataset);
};

const insertDataset = async ({
    lastCompletedAt = null,
    lastFailedAt = null,
    nextRefreshAt,
    reportId = null,
    reportRequestedAt = null,
    status,
}: {
    lastCompletedAt?: Date | null;
    lastFailedAt?: Date | null;
    nextRefreshAt: Date | null;
    reportId?: string | null;
    reportRequestedAt?: Date | null;
    status: string;
}) => {
    await db.insert(topSearchTermsDatasets).values({
        dataEndDate: '2026-08-01',
        dataStartDate: '2026-08-01',
        lastCompletedAt,
        lastFailedAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        nextRefreshAt,
        reportId,
        reportRequestedAt,
        reportPeriod: 'DAY',
        status,
    });
};
