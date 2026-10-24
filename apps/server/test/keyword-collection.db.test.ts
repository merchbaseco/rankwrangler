import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries } from '@/db/catalog-search-schema';
import {
    keywordDiscoveryAttempts,
    keywordExplorationPasses,
    keywordProducts,
} from '@/db/keyword-collection-schema';
import {
    checkpointDiscoveryPage,
    claimKeywordExploration,
    reserveDiscoveryAttempt,
    stopDiscoveryWork,
} from '@/db/keyword-discovery';
import { resolveScheduledKeywordHead } from '@/db/keyword-scheduling';
import { products } from '@/db/product-schema';

const now = new Date('2026-10-23T12:00:00Z');
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'keyword collection transactions',
    () => {
        beforeEach(async () => {
            await db.delete(catalogQueries);
        });
        it('makes a never-observed admitted keyword due regardless of stored product matches', async () => {
            const [query] = await db
                .insert(catalogQueries)
                .values({
                    source: 'keepa',
                    marketplaceId: 'ATVPDKIKX0DER',
                    normalizedTerm: 'fishing',
                    displayTerm: 'Fishing',
                    tier: 'probation',
                    nextDueAt: now,
                })
                .returning();
            const [a, b] = await Promise.all([
                resolveScheduledKeywordHead({ queryId: query.id, now }),
                resolveScheduledKeywordHead({ queryId: query.id, now }),
            ]);
            expect(
                [a, b].filter(result => result.kind === 'pending' && result.created)
            ).toHaveLength(1);
            expect(a.kind === 'pending' && a.operation.input.workClass).toBe('discovery');
            expect(b.kind === 'pending' && b.operation.id).toBe(
                a.kind === 'pending' && a.operation.id
            );
        });
        it('finds eligible work beyond thirty deferred exploration passes', async () => {
            const queries = await db
                .insert(catalogQueries)
                .values(
                    Array.from({ length: 31 }, (_, i) => ({
                        source: 'keepa',
                        marketplaceId: 'ATVPDKIKX0DER',
                        normalizedTerm: `queued-${i}`,
                        displayTerm: `Queued ${i}`,
                        tier: 'probation',
                        latestSuccessfulRunAt: new Date(now.getTime() - i * 1000),
                    }))
                )
                .returning({ id: catalogQueries.id });
            await db.insert(keywordExplorationPasses).values(
                queries.slice(0, 30).map(query => ({
                    queryId: query.id,
                    resumeAt: new Date(now.getTime() + 86_400_000),
                    stopReason: 'lowYield',
                }))
            );
            const work = await claimKeywordExploration(now);
            expect(work?.pass.queryId).toBe(queries[30].id);
        });

        it('caps durable reservations at ten per keyword across attempts and restarts', async () => {
            await createQuery('fishing');
            const work = await claimKeywordExploration(now);
            expect(work).not.toBeNull();
            if (!work?.pass.claimAt) throw new Error('Missing discovery claim.');
            for (let page = 0; page < 10; page += 1) {
                expect(
                    await reserveDiscoveryAttempt({
                        queryId: work.pass.queryId,
                        passId: work.pass.id,
                        claimAt: work.pass.claimAt,
                        page,
                        now,
                    })
                ).toBeString();
            }
            expect(
                await reserveDiscoveryAttempt({
                    queryId: work.pass.queryId,
                    passId: work.pass.id,
                    claimAt: work.pass.claimAt,
                    page: 10,
                    now,
                })
            ).toBeNull();
            const attempts = await db
                .select()
                .from(keywordDiscoveryAttempts)
                .where(eq(keywordDiscoveryAttempts.queryId, work.pass.queryId));
            expect(attempts).toHaveLength(10);
        });
        it('checkpoints keyword novelty and rejects a stale owner before product writes', async () => {
            await createQuery('gardening');
            const work = await claimKeywordExploration(now);
            if (!work?.pass.claimAt) throw new Error('Missing discovery claim.');
            const claimAt = work.pass.claimAt;
            const attemptId = await reserveDiscoveryAttempt({
                queryId: work.pass.queryId,
                passId: work.pass.id,
                claimAt,
                page: 0,
                now,
            });
            if (!attemptId) throw new Error('Missing discovery attempt.');
            let writes = 0;
            const persist = async (
                tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
                asins: string[]
            ) => {
                writes += 1;
                const rows = await tx
                    .insert(products)
                    .values(
                        asins.map(asin => ({
                            asin,
                            marketplaceId: 'ATVPDKIKX0DER',
                            isMerchListing: true,
                        }))
                    )
                    .onConflictDoUpdate({
                        target: [products.marketplaceId, products.asin],
                        set: { isMerchListing: true },
                    })
                    .returning({ id: products.id });
                return {
                    productIds: rows.map(row => row.id),
                    merchProductIds: rows.map(row => row.id),
                };
            };
            const input = {
                passId: work.pass.id,
                claimAt,
                attemptId,
                page: 0,
                nextPageToken: 'next',
                observedAt: now,
                products: ['B0TEST0001'],
                persist,
            };
            const accepted = await checkpointDiscoveryPage(input);
            expect(accepted).toMatchObject({
                nextPage: 1,
                contiguousPages: 1,
                lowYieldPages: 1,
                stopReason: 'running',
            });
            expect(
                await db
                    .select()
                    .from(keywordProducts)
                    .where(eq(keywordProducts.queryId, work.pass.queryId))
            ).toHaveLength(1);
            await stopDiscoveryWork({ passId: work.pass.id, claimAt, reason: 'jobCap', now });
            await expect(checkpointDiscoveryPage({ ...input, page: 1 })).rejects.toThrow(
                'ownership expired'
            );
            expect(writes).toBe(1);
            const [pass] = await db
                .select()
                .from(keywordExplorationPasses)
                .where(eq(keywordExplorationPasses.id, work.pass.id));
            expect(pass.nextPage).toBe(1);
            expect(pass.oldestPageAt).toEqual(now);
        });
    }
);
const createQuery = async (term: string) =>
    await db.insert(catalogQueries).values({
        source: 'keepa',
        marketplaceId: 'ATVPDKIKX0DER',
        normalizedTerm: term,
        displayTerm: term,
        tier: 'probation',
        nextDueAt: now,
    });
