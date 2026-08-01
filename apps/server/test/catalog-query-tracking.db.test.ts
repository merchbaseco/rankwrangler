import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import type { Context } from '@/api/context';
import { appRouter } from '@/api/router';
import { setCatalogQueryTracking } from '@/db/catalog-query-tracking';
import { resolveCatalogSearchRequest, resolveDueCatalogSearchRequest } from '@/db/catalog-search';
import { db } from '@/db/index';
import { persistCatalogSearchSuccess } from '@/db/persist-catalog-search';
import { catalogQueries, catalogSearchResults, catalogSearchRuns, operations } from '@/db/schema';
import {
    CATALOG_QUERY_TRACKING_INTERVAL_MS,
    CATALOG_QUERY_TRACKING_RETRY_INTERVAL_MS,
} from '@/services/catalog-query-tracking';

const NOW = new Date('2026-07-24T12:00:00.000Z');

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'Catalog query weekly tracking persistence',
    () => {
        beforeEach(async () => {
            await db.delete(catalogSearchResults);
            await db.delete(catalogSearchRuns);
            await db.delete(operations);
            await db.delete(catalogQueries);
        });

        it('exposes explicit tracking and latest completion through app and public procedures', async () => {
            const queryId = await insertQuery({
                latestSuccessfulRunAt: new Date('2026-07-20T12:00:00.000Z'),
            });
            const appCaller = appRouter.createCaller(createContext('app'));
            const publicCaller = appRouter.createCaller(createContext('public'));

            const tracked = await appCaller.api.app.catalog.query.track({
                term: '  Garden   Shirt ',
            });
            const read = await publicCaller.api.public.catalog.query.get({
                term: 'garden shirt',
            });
            const untracked = await publicCaller.api.public.catalog.query.untrack({
                term: 'garden shirt',
            });

            expect(tracked).toMatchObject({
                id: queryId,
                tracking: { enabled: true },
            });
            expect(read).toMatchObject({
                id: queryId,
                tracking: { enabled: true },
                latestSuccessfulCompletionAt: '2026-07-20T12:00:00.000Z',
            });
            expect(untracked).toEqual({
                id: queryId,
                tracking: { enabled: false, trackedAt: null },
            });
        });

        it('selects never-run and exactly-seven-day queries but excludes fresh and untracked', async () => {
            const neverRunId = await insertQuery({ term: 'never run', trackedAt: NOW });
            const boundaryId = await insertQuery({
                term: 'boundary',
                trackedAt: NOW,
                latestSuccessfulRunAt: new Date(NOW.getTime() - CATALOG_QUERY_TRACKING_INTERVAL_MS),
            });
            await insertQuery({
                term: 'fresh',
                trackedAt: NOW,
                latestSuccessfulRunAt: new Date(
                    NOW.getTime() - CATALOG_QUERY_TRACKING_INTERVAL_MS + 1
                ),
            });
            await insertQuery({
                term: 'untracked',
                latestSuccessfulRunAt: new Date('2020-01-01T00:00:00.000Z'),
            });
            await insertQuery({
                term: 'retry backoff',
                trackedAt: NOW,
                nextTrackingAttemptAt: new Date(NOW.getTime() + 1),
            });

            const { listDueTrackedCatalogQueries } = await import('@/db/catalog-query-tracking');
            const due = await listDueTrackedCatalogQueries({
                dueAtOrBefore: new Date(NOW.getTime() - CATALOG_QUERY_TRACKING_INTERVAL_MS),
                now: NOW,
            });

            expect(due.map(query => query.id).sort()).toEqual([neverRunId, boundaryId].sort());
        });

        it('creates at most one current scheduled run across concurrent and restart scans', async () => {
            const queryId = await insertQuery({ trackedAt: NOW });
            const resolve = () =>
                resolveDueCatalogSearchRequest({
                    queryId,
                    now: NOW,
                    dueIntervalMs: CATALOG_QUERY_TRACKING_INTERVAL_MS,
                    retryIntervalMs: CATALOG_QUERY_TRACKING_RETRY_INTERVAL_MS,
                });

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

        it('advances the watermark only for a fresh success and retains history when untracked', async () => {
            const oldWatermark = new Date('2026-07-01T12:00:00.000Z');
            const queryId = await insertQuery({
                trackedAt: NOW,
                latestSuccessfulRunAt: oldWatermark,
            });
            const [operation] = await db
                .insert(operations)
                .values({
                    type: 'catalogSearch',
                    targetKey: queryId,
                    input: createOperationInput(queryId),
                })
                .returning({ id: operations.id });
            if (!operation) {
                throw new Error('Test Operation was not created.');
            }

            await persistCatalogSearchSuccess({
                operationId: operation.id,
                queryId,
                sourceStartedAt: new Date(NOW.getTime() - 1000),
                sourceCompletedAt: NOW,
                results: [],
                internalUsage: {
                    tokensConsumed: 0,
                    tokensLeft: 100,
                    refillInMs: 0,
                    refillRate: 20,
                },
            });
            const cached = await resolveCatalogSearchRequest({
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: 'garden shirt',
                displayTerm: 'Garden Shirt',
                page: 0,
                maxAgeSeconds: 86_400,
                priority: 'interactive',
                now: new Date(NOW.getTime() + 1000),
            });
            await setCatalogQueryTracking({
                normalizedTerm: 'garden shirt',
                enabled: false,
                now: new Date(NOW.getTime() + 2000),
            });
            const [storedQuery] = await db
                .select()
                .from(catalogQueries)
                .where(eq(catalogQueries.id, queryId));
            const runs = await db
                .select()
                .from(catalogSearchRuns)
                .where(eq(catalogSearchRuns.queryId, queryId));

            expect(cached.kind).toBe('ready');
            expect(storedQuery?.latestSuccessfulRunAt).toEqual(NOW);
            expect(storedQuery?.trackedAt).toBeNull();
            expect(runs).toHaveLength(1);
        });
    }
);

const insertQuery = async ({
    term = 'garden shirt',
    trackedAt = null,
    latestSuccessfulRunAt = null,
    nextTrackingAttemptAt = null,
}: {
    term?: string;
    trackedAt?: Date | null;
    latestSuccessfulRunAt?: Date | null;
    nextTrackingAttemptAt?: Date | null;
}) => {
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: term,
            displayTerm: term.replace(/\b\w/g, value => value.toUpperCase()),
            page: 0,
            trackedAt,
            nextTrackingAttemptAt,
            latestSuccessfulRunAt,
        })
        .returning({ id: catalogQueries.id });
    if (!query) {
        throw new Error('Test Catalog query was not created.');
    }
    return query.id;
};

const createOperationInput = (queryId: string) => ({
    queryId,
    marketplaceId: 'ATVPDKIKX0DER' as const,
    term: 'Garden Shirt',
    page: 0 as const,
    priority: 'interactive' as const,
});

const createContext = (authType: 'app' | 'public') =>
    ({
        user: { sub: 'mbu_catalog_test' },
        isAdmin: false,
        authType: 'access',
        credentialKind: authType === 'app' ? 'session' : 'oauth',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_catalog_test',
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
            lastUsedAt: null,
            usageToday: 0,
            usageCount: 0,
            usageLimit: 100,
            lastResetAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
