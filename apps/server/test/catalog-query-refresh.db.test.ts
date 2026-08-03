import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { getCatalogQuery, listCatalogQueries } from '@/db/catalog-query-read-model';
import { listDueActiveCatalogQueries } from '@/db/catalog-query-refresh';
import { resolveCatalogSearchRequest, resolveDueCatalogSearchRequest } from '@/db/catalog-search';
import { getCatalogSearchRun } from '@/db/catalog-search-history';
import { db } from '@/db/index';
import { completeOperationWithError } from '@/db/operations';
import { persistCatalogSearchSuccess } from '@/db/persist-catalog-search';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    rankwranglerServiceAccounts,
} from '@/db/schema';
import {
    CATALOG_QUERY_ACTIVE_WINDOW_MS,
    CATALOG_QUERY_REFRESH_INTERVAL_MS,
    CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS,
} from '@/services/catalog-query-refresh-policy';

const SERVICE_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-07-24T12:00:00.000Z');

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'Catalog keyword refresh persistence',
    () => {
        beforeEach(async () => {
            await db.delete(catalogSearchResults);
            await db.delete(catalogSearchRuns);
            await db.delete(operations);
            await db.delete(catalogQueries);
            await db.delete(rankwranglerServiceAccounts);
        });

        it('renews accepted cached, joined, and new requests but not rejected work', async () => {
            const queryId = await insertQuery({
                term: 'garden shirt',
                lastRequestedAt: new Date('2026-06-01T12:00:00.000Z'),
                activeUntil: new Date('2026-06-10T12:00:00.000Z'),
                latestSuccessfulRunAt: NOW,
            });
            await insertRun(queryId, NOW, 'requested');
            await insertServiceAccount();

            expect(
                await resolveCatalogSearchRequest({
                    ...createRequest('garden shirt'),
                    now: new Date(NOW.getTime() + 1000),
                })
            ).toMatchObject({ kind: 'ready' });
            const [cachedQuery] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, queryId));
            expect(cachedQuery?.lastRequestedAt).toEqual(new Date(NOW.getTime() + 1000));
            expect(cachedQuery?.activeUntil).toEqual(
                new Date(NOW.getTime() + 1000 + CATALOG_QUERY_ACTIVE_WINDOW_MS)
            );

            const pending = await resolveCatalogSearchRequest(createRequest('new keyword'));
            expect(pending).toMatchObject({ kind: 'pending', created: true });
            const [newQuery] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.normalizedTerm, 'new keyword'));
            expect(newQuery?.lastRequestedAt).toEqual(NOW);
            expect(newQuery?.activeUntil).toEqual(
                new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS)
            );
            expect((pending.kind === 'pending' ? pending.operation.input : null)?.trigger).toBe(
                'requested'
            );

            const joinedAt = new Date(NOW.getTime() + 2000);
            expect(
                await resolveCatalogSearchRequest({
                    ...createRequest('new keyword'),
                    now: joinedAt,
                })
            ).toMatchObject({ kind: 'pending', created: false });
            const [joinedQuery] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.normalizedTerm, 'new keyword'));
            expect(joinedQuery?.lastRequestedAt).toEqual(joinedAt);
            expect(joinedQuery?.activeUntil).toEqual(
                new Date(joinedAt.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS)
            );

            const rejected = await resolveCatalogSearchRequest({
                ...createRequest('rejected keyword'),
                serviceAccountId: '44444444-4444-4444-8444-444444444444',
            });
            expect(rejected).toMatchObject({
                kind: 'billingRejected',
                reason: 'serviceAccountNotFound',
            });
            const [rejectedQuery] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.normalizedTerm, 'rejected keyword'));
            expect(rejectedQuery).toMatchObject({
                lastRequestedAt: null,
                activeUntil: null,
            });
            expect(
                (
                    await listDueActiveCatalogQueries({
                        dueAtOrBefore: NOW,
                        now: NOW,
                    })
                ).map(query => query.id)
            ).not.toContain(rejectedQuery?.id);
        });

        it('selects active due keywords and excludes fresh, deferred, and expired keywords', async () => {
            const neverSuccessfulId = await insertQuery({
                term: 'never successful',
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
            });
            const dueId = await insertQuery({
                term: 'due keyword',
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
                latestSuccessfulRunAt: new Date(NOW.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS),
            });
            await insertQuery({
                term: 'fresh keyword',
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
                latestSuccessfulRunAt: new Date(NOW.getTime() - 1),
            });
            const expiredId = await insertQuery({
                term: 'expired keyword',
                activeUntil: new Date(NOW.getTime() - 1),
                latestSuccessfulRunAt: new Date('2020-01-01T00:00:00.000Z'),
            });
            await db.insert(operations).values({
                type: 'catalogSearch',
                targetKey: expiredId,
                input: createRequest('expired keyword'),
            });
            await insertQuery({
                term: 'deferred keyword',
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
                latestSuccessfulRunAt: new Date(NOW.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS),
                nextRefreshAttemptAt: new Date(NOW.getTime() + 1),
            });

            const due = await listDueActiveCatalogQueries({
                dueAtOrBefore: new Date(NOW.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS),
                now: NOW,
            });
            expect(due.map(query => query.id)).toEqual([neverSuccessfulId, dueId]);

            const scheduled = await resolveDueCatalogSearchRequest({ queryId: dueId, now: NOW });
            expect(scheduled).toMatchObject({ kind: 'pending', created: true });
            if (scheduled.kind !== 'pending') {
                throw new Error('Expected an automatic Catalog operation.');
            }
            expect(scheduled.operation.input).toMatchObject({
                priority: 'scheduled',
                trigger: 'automatic',
            });
            const [updated] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, dueId));
            expect(updated?.lastRefreshAttemptAt).toEqual(NOW);
            expect(updated?.nextRefreshAttemptAt).toEqual(
                new Date(NOW.getTime() + CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS)
            );
            const listed = await listCatalogQueries({ limit: 1, now: NOW });
            expect(listed.items).toMatchObject([
                {
                    id: neverSuccessfulId,
                    status: 'due',
                },
            ]);
            expect(listed.summary.active).toBe(4);
        });

        it('retries failed automatic work after the durable backoff and keeps run provenance', async () => {
            const queryId = await insertQuery({
                term: 'retry keyword',
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
                latestSuccessfulRunAt: new Date(NOW.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS),
            });
            const first = await resolveDueCatalogSearchRequest({ queryId, now: NOW });
            if (first.kind !== 'pending') {
                throw new Error('Expected the first automatic operation.');
            }
            await completeOperationWithError({
                operationId: first.operation.id,
                error: { code: 'PROVIDER_UNAVAILABLE', message: 'Catalog search failed.' },
                completedAt: NOW,
            });
            expect((await listCatalogQueries({ limit: 1, now: NOW })).items[0]?.status).toBe(
                'failed'
            );
            expect(
                await resolveDueCatalogSearchRequest({
                    queryId,
                    now: new Date(NOW.getTime() + CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS - 1),
                })
            ).toEqual({ kind: 'notDue' });

            const second = await resolveDueCatalogSearchRequest({
                queryId,
                now: new Date(NOW.getTime() + CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS),
            });
            expect(second).toMatchObject({ kind: 'pending', created: true });

            await persistCatalogSearchSuccess({
                operationId: second.kind === 'pending' ? second.operation.id : '',
                queryId,
                sourceStartedAt: NOW,
                sourceCompletedAt: new Date(NOW.getTime() + 1000),
                trigger: 'automatic',
                results: [],
                internalUsage: {
                    tokensConsumed: 0,
                    tokensLeft: 100,
                    refillInMs: 0,
                    refillRate: 20,
                },
            });
            const run = await db
                .select({ trigger: catalogSearchRuns.trigger })
                .from(catalogSearchRuns)
                .where(eq(catalogSearchRuns.queryId, queryId));
            expect(run).toEqual([{ trigger: 'automatic' }]);
            expect(
                (await getCatalogQuery('retry keyword', new Date(NOW.getTime() + 1000)))?.status
            ).toBe('waiting');
            expect(
                (await getCatalogSearchRun(run[0] ? await getLatestRunId(queryId) : ''))?.trigger
            ).toBe('automatic');
        });

        it('creates at most one pending automatic operation across concurrent scans', async () => {
            const queryId = await insertQuery({
                term: 'concurrent keyword',
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
            });
            const resolve = () => resolveDueCatalogSearchRequest({ queryId, now: NOW });

            const first = await Promise.all([resolve(), resolve()]);
            const afterRestart = await resolve();
            const pending = await db
                .select()
                .from(operations)
                .where(
                    and(
                        eq(operations.type, 'catalogSearch'),
                        eq(operations.targetKey, queryId),
                        eq(operations.status, 'pending')
                    )
                );

            expect(
                first.filter(result => result.kind === 'pending' && result.created)
            ).toHaveLength(1);
            expect(afterRestart).toMatchObject({ kind: 'pending', created: false });
            expect(pending).toHaveLength(1);
        });

        it('exposes activity fields and trigger on retained query/run reads', async () => {
            const queryId = await insertQuery({
                term: 'history keyword',
                lastRequestedAt: NOW,
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
            });
            await insertRun(queryId, NOW, 'requested');

            const query = await getCatalogQuery('history keyword', NOW);
            expect(query).toMatchObject({
                id: queryId,
                lastRequestedAt: NOW.toISOString(),
                activeUntil: new Date(NOW.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS).toISOString(),
                latestSuccessfulRunAt: NOW.toISOString(),
                status: 'waiting',
                observationCount: 1,
                latestRun: { trigger: 'requested' },
            });
            expect(query).not.toHaveProperty('tracking');
        });
    }
);

const insertServiceAccount = async () => {
    await db.insert(rankwranglerServiceAccounts).values({
        id: SERVICE_ACCOUNT_ID,
        merchbaseUserId: 'mbu_catalog_test',
        usageLimit: 100,
        lastResetAt: NOW,
    });
};

const insertQuery = async ({
    term,
    lastRequestedAt = null,
    activeUntil = null,
    latestSuccessfulRunAt = null,
    nextRefreshAttemptAt = null,
}: {
    term: string;
    lastRequestedAt?: Date | null;
    activeUntil?: Date | null;
    latestSuccessfulRunAt?: Date | null;
    nextRefreshAttemptAt?: Date | null;
}) => {
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: term,
            displayTerm: term.replace(/\b\w/g, value => value.toUpperCase()),
            page: 0,
            lastRequestedAt,
            activeUntil,
            latestSuccessfulRunAt,
            nextRefreshAttemptAt,
        })
        .returning({ id: catalogQueries.id });
    if (!query) {
        throw new Error('Test Catalog query was not created.');
    }
    return query.id;
};

const insertRun = async (
    queryId: string,
    completedAt: Date,
    trigger: 'requested' | 'automatic'
) => {
    const [operation] = await db
        .insert(operations)
        .values({
            type: 'catalogSearch',
            targetKey: queryId,
            input: createRequest('test keyword'),
        })
        .returning({ id: operations.id });
    if (!operation) {
        throw new Error('Test Operation was not created.');
    }
    const [run] = await db
        .insert(catalogSearchRuns)
        .values({
            queryId,
            operationId: operation.id,
            sourceStartedAt: new Date(completedAt.getTime() - 60_000),
            sourceCompletedAt: completedAt,
            trigger,
            resultCount: 0,
            normalizerVersion: 1,
            createdAt: completedAt,
        })
        .returning({ id: catalogSearchRuns.id });
    if (!run) {
        throw new Error('Test Catalog Search run was not created.');
    }
    await db
        .update(operations)
        .set({
            status: 'completed',
            resource: { type: 'catalogSearchRun', queryId, runId: run.id },
            completedAt,
            updatedAt: completedAt,
        })
        .where(eq(operations.id, operation.id));
    await db
        .update(catalogQueries)
        .set({ latestSuccessfulRunAt: completedAt })
        .where(eq(catalogQueries.id, queryId));
    return run.id;
};

const getLatestRunId = async (queryId: string) => {
    const [run] = await db
        .select({ id: catalogSearchRuns.id })
        .from(catalogSearchRuns)
        .where(eq(catalogSearchRuns.queryId, queryId))
        .orderBy(catalogSearchRuns.sourceCompletedAt)
        .limit(1);
    return run?.id ?? '';
};

const createRequest = (term: string) => ({
    source: 'keepa' as const,
    marketplaceId: 'ATVPDKIKX0DER' as const,
    normalizedTerm: term,
    displayTerm: term.replace(/\b\w/g, value => value.toUpperCase()),
    page: 0 as const,
    maxAgeSeconds: 86_400,
    priority: 'interactive' as const,
    trigger: 'requested' as const,
    serviceAccountId: SERVICE_ACCOUNT_ID,
    ownerMerchbaseUserId: 'mbu_catalog_test',
    now: NOW,
});
