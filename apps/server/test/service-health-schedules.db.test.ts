import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, like } from 'drizzle-orm';
import { db } from '@/db/index';
import { operations } from '@/db/ops-schema';
import { releaseCatalogSearchWork } from '@/db/catalog-search-operations';
import { catalogQueries } from '@/db/schema';
import { CATALOG_QUERY_REFRESH_INTERVAL_MS } from '@/services/catalog-query-refresh-policy';
import { CATALOG_QUERIES_SCHEDULER_LAG_MS, dueBefore } from '@/services/service-health';
import { probeCatalogQueries } from '@/services/service-health-queries';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'service health schedule probes',
    () => {
        beforeEach(async () => {
            await db
                .delete(catalogQueries)
                .where(like(catalogQueries.normalizedTerm, 'health-probe-%'));
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
    }
);

const minutesBefore = (date: Date, minutes = 1) => new Date(date.getTime() - minutes * MINUTE_MS);

const minutesAfter = (date: Date, minutes = 1) => new Date(date.getTime() + minutes * MINUTE_MS);

const catalogSuccessDueAt = () =>
    dueBefore(NOW, CATALOG_QUERY_REFRESH_INTERVAL_MS, CATALOG_QUERIES_SCHEDULER_LAG_MS);

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
