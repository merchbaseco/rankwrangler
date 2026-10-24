import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchRuns,
    catalogSearchResults,
} from '@/db/catalog-search-schema';
import { keepaCapacityAttempts, keepaCapacityState } from '@/db/keepa-capacity-schema';
import { lockCatalogQueryForReconciliation } from '@/db/catalog-query-resolution';
import { acceptKeywordObservation } from '@/db/keyword-observation';
import { lockKeywordScheduling } from '@/db/keyword-scheduling-lock';
import { refreshKeywordDemand } from '@/db/keyword-demand';
import { keywordProducts } from '@/db/keyword-collection-schema';
import { products } from '@/db/product-schema';
import { operations } from '@/db/ops-schema';
import {
    topSearchTermsDatasets,
    topSearchTermsSnapshots,
    topSearchTermsKeywordDaily,
} from '@/db/top-search-terms-schema';

const now = new Date('2026-10-23T12:00:00Z');
const day = 86_400_000;
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'keyword scheduling serialization',
    () => {
        beforeEach(async () => {
            await db.delete(catalogQueries);
            await db.delete(keepaCapacityAttempts);
            await db.delete(keepaCapacityState);
            await db.delete(topSearchTermsDatasets);
            await db.insert(keepaCapacityState).values({
                id: 1,
                tokensLeft: 1200,
                refillRate: 20,
                refillInMs: 60_000,
                observedAt: new Date(),
            });
            await db.insert(keepaCapacityAttempts).values([
                { operation: 'search', workClass: 'head', actualTokens: 10 },
                { operation: 'product', workClass: 'history', actualTokens: 1 },
            ]);
        });
        it('keeps an adaptive interval from exceeding the standing keyword allowance', async () => {
            await db.update(keepaCapacityState).set({ refillRate: 1, tokensLeft: 60 });
            await db.insert(catalogQueries).values(
                Array.from({ length: 31 }, (_, i) => ({
                    source: 'keepa',
                    marketplaceId: 'ATVPDKIKX0DER',
                    normalizedTerm: `load-${i}`,
                    displayTerm: `Load ${i}`,
                    tier: i < 25 ? 'hot' : 'warm',
                    intervalDays: i < 25 ? 1 : i < 30 ? 7 : 14,
                }))
            );
            const observation = await seedObservation();
            await db.transaction(async tx => {
                await lockKeywordScheduling(tx);
                await lockCatalogQueryForReconciliation(tx, observation.queryId);
                await acceptKeywordObservation(tx, observation);
            });
            const [query] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, observation.queryId));
            expect(query.intervalDays).toBe(14);
            expect(query.latestSuccessfulRunAt).toEqual(now);
        });
        it('finishes five concurrent scheduling writers without another pool connection', async () => {
            const observations = [];
            for (let index = 0; index < 5; index += 1)
                observations.push(await seedObservation(`fishing-${index}`));
            await Promise.race([
                Promise.all(
                    observations.map(observation =>
                        db.transaction(async tx => {
                            await lockKeywordScheduling(tx);
                            await lockCatalogQueryForReconciliation(tx, observation.queryId);
                            await acceptKeywordObservation(tx, observation);
                        })
                    )
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Scheduling writers exhausted their pool')),
                        2000
                    )
                ),
            ]);
            for (const observation of observations) {
                const [query] = await db
                    .select()
                    .from(catalogQueries)
                    .where(eq(catalogQueries.id, observation.queryId));
                expect(query.intervalDays).toBe(7);
            }
        });

        it('promotes demand using the head success committed while it was waiting', async () => {
            const observation = await seedObservation();
            await seedDemand();
            let announce = () => {};
            let release = () => {};
            const held = new Promise<void>(resolve => {
                announce = resolve;
            });
            const gate = new Promise<void>(resolve => {
                release = resolve;
            });
            const head = db.transaction(async tx => {
                await lockKeywordScheduling(tx);
                await lockCatalogQueryForReconciliation(tx, observation.queryId);
                await acceptKeywordObservation(tx, observation);
                announce();
                await gate;
            });
            await held;
            const demand = refreshKeywordDemand(now);
            await new Promise(resolve => setTimeout(resolve, 30));
            release();
            await Promise.all([head, demand]);
            const [query] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, observation.queryId));
            expect(query.tier).toBe('hot');
            expect(query.latestSuccessfulRunAt).toEqual(now);
            expect(query.nextDueAt?.getTime()).toBeGreaterThanOrEqual(now.getTime() + day);
        });
    }
);

const seedObservation = async (term = 'fishing shirt') => {
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: term,
            displayTerm: term,
            tier: 'warm',
            intervalDays: 14,
            latestSuccessfulRunAt: new Date(now.getTime() - 14 * day),
            merchObservedAt: new Date(now.getTime() - 14 * day),
        })
        .returning();
    const rows = await db
        .insert(products)
        .values(
            Array.from({ length: 8 }, (_, i) => ({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: `B0RACE000${i}`,
                isMerchListing: true,
            }))
        )
        .onConflictDoUpdate({
            target: [products.marketplaceId, products.asin],
            set: { isMerchListing: true },
        })
        .returning({ id: products.id });
    const previousIds = rows.slice(0, 5).map(row => row.id);
    const currentIds = [...rows.slice(0, 2), ...rows.slice(5)].map(row => row.id);
    await db.insert(keywordProducts).values(
        previousIds.map(productId => ({
            queryId: query.id,
            productId,
            firstObservedAt: now,
            lastObservedAt: now,
        }))
    );
    const opRows = await db
        .insert(operations)
        .values(
            [0, 1].map(i => ({
                type: 'catalogSearch',
                targetKey: `${query.id}-${i}`,
                input: { queryId: query.id },
            }))
        )
        .returning({ id: operations.id });
    const runs = await db
        .insert(catalogSearchRuns)
        .values(
            opRows.map((operation, i) => ({
                queryId: query.id,
                operationId: operation.id,
                sourceStartedAt: new Date(now.getTime() - (1 - i) * 14 * day),
                sourceCompletedAt: new Date(now.getTime() - (1 - i) * 14 * day),
                trigger: 'automatic',
                resultCount: 5,
                normalizerVersion: 1,
            }))
        )
        .returning({ id: catalogSearchRuns.id });
    await db.insert(catalogSearchResults).values(
        previousIds.map((productId, i) => ({
            runId: runs[0].id,
            productId,
            sourcePosition: i + 1,
        }))
    );
    return {
        queryId: query.id,
        runId: runs[1].id,
        page: 0,
        completedAt: now,
        resultCount: 5,
        productIds: currentIds,
    };
};
const seedDemand = async () => {
    const [dataset] = await db
        .insert(topSearchTermsDatasets)
        .values({
            marketplaceId: 'ATVPDKIKX0DER',
            reportPeriod: 'DAY',
            dataStartDate: '2026-10-22',
            dataEndDate: '2026-10-22',
        })
        .returning();
    const [snapshot] = await db
        .insert(topSearchTermsSnapshots)
        .values({
            datasetId: dataset.id,
            marketplaceId: 'ATVPDKIKX0DER',
            reportPeriod: 'DAY',
            dataStartDate: '2026-10-22',
            dataEndDate: '2026-10-22',
            observedDate: '2026-10-23',
            reportId: 'race',
            sourceJobId: 'race',
            fetchedAt: now,
        })
        .returning();
    await db.insert(topSearchTermsKeywordDaily).values(
        Array.from({ length: 30 }, (_, i) => ({
            snapshotId: snapshot.id,
            datasetId: dataset.id,
            marketplaceId: 'ATVPDKIKX0DER',
            reportPeriod: 'DAY',
            dataStartDate: '2026-10-22',
            dataEndDate: '2026-10-22',
            observedDate: '2026-10-23',
            searchTerm: i ? `term-${i} shirt` : 'fishing shirt',
            searchFrequencyRank: i + 1,
            clickShareTop3SumBasisPoints: 0,
            conversionShareTop3SumBasisPoints: 0,
            isMerchRelevant: true,
            merchReason: 'apparel',
        }))
    );
};
