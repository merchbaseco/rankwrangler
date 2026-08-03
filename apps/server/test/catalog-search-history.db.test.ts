import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import type { Context } from '@/api/context';
import { appRouter } from '@/api/router';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    products,
    spApiSyncQueue,
} from '@/db/schema';

const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Catalog search history reads', () => {
    beforeEach(async () => {
        await db.delete(spApiSyncQueue);
        await db.delete(catalogSearchResults);
        await db.delete(catalogSearchRuns);
        await db.delete(operations);
        await db.delete(catalogQueries);
        await db.delete(products);
    });

    it('exposes query state and newest-first paginated runs through app and public APIs', async () => {
        const queryId = await insertQuery('Retro Gardening Shirt');
        const oldestRunId = await insertRun(queryId, '2026-07-01T12:00:00.000Z', 4);
        const emptyRunId = await insertRun(queryId, '2026-07-08T12:00:00.000Z', 0);
        const latestRunId = await insertRun(queryId, '2026-07-15T12:00:00.000Z', 2);
        const appCaller = appRouter.createCaller(createContext('app'));
        const publicCaller = appRouter.createCaller(createContext('public'));

        const [appQuery, publicQuery] = await Promise.all([
            appCaller.api.app.catalog.query.get({ term: ' retro   gardening SHIRT ' }),
            publicCaller.api.public.catalog.query.get({ term: 'retro gardening shirt' }),
        ]);
        expect(appQuery).toEqual(publicQuery);
        expect(publicQuery).toMatchObject({
            id: queryId,
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: 'retro gardening shirt',
            displayTerm: 'Retro Gardening Shirt',
            page: 0,
            lastRequestedAt: null,
            activeUntil: null,
            latestSuccessfulRunAt: '2026-07-15T12:00:00.000Z',
            status: 'inactive',
            observationCount: 3,
            latestRun: {
                id: latestRunId,
                resultCount: 2,
                sourceCompletedAt: '2026-07-15T12:00:00.000Z',
            },
        });

        const firstPage = await publicCaller.api.public.catalog.run.list({
            queryId,
            limit: 2,
        });
        expect(firstPage.items.map(run => [run.id, run.resultCount])).toEqual([
            [latestRunId, 2],
            [emptyRunId, 0],
        ]);
        expect(firstPage.nextCursor).toBe(emptyRunId);

        const secondPage = await appCaller.api.app.catalog.run.list({
            queryId,
            limit: 2,
            cursor: firstPage.nextCursor ?? undefined,
        });
        expect(secondPage).toEqual({
            items: [
                expect.objectContaining({
                    id: oldestRunId,
                    resultCount: 4,
                }),
            ],
            nextCursor: null,
        });
    });

    it('keeps observations immutable while presenting canonical current Product state separately', async () => {
        const queryId = await insertQuery('Garden Shirt');
        const runId = await insertRun(queryId, '2026-07-01T12:00:00.000Z', 1);
        const productId = await insertProduct();
        await insertResult(runId, productId);
        const caller = appRouter.createCaller(createContext('public'));

        const before = await caller.api.public.catalog.run.get({ id: runId });
        await db
            .update(products)
            .set({
                title: 'Canonical title after refresh',
                keepaCurrentBsr: 900,
                keepaSourceUpdatedAt: new Date('2026-07-20T12:00:00.000Z'),
            })
            .where(eq(products.id, productId));
        const after = await caller.api.public.catalog.run.get({ id: runId });

        expect(after.results[0]?.observed).toEqual(before.results[0]?.observed);
        expect(after.results[0]).toMatchObject({
            position: { source: 'keepa', value: 1 },
            observed: {
                rootCategoryBsr: 1234,
                sourceUpdatedAt: '2026-07-01T11:55:00.000Z',
            },
            currentProduct: {
                title: 'Canonical title after refresh',
                keepa: { currentRootCategoryBsr: 900 },
            },
        });
    });

    it('retains empty runs and result membership when canonical Product state is missing', async () => {
        const queryId = await insertQuery('Missing Product');
        const populatedRunId = await insertRun(queryId, '2026-07-01T12:00:00.000Z', 1);
        const emptyRunId = await insertRun(queryId, '2026-07-08T12:00:00.000Z', 0);
        const productId = await insertProduct();
        await insertResult(populatedRunId, productId);

        await db.transaction(async transaction => {
            await transaction.execute(sql`set local session_replication_role = replica`);
            await transaction.delete(products).where(eq(products.id, productId));
        });

        const caller = appRouter.createCaller(createContext('app'));
        const [populated, empty] = await Promise.all([
            caller.api.app.catalog.run.get({ id: populatedRunId }),
            caller.api.app.catalog.run.get({ id: emptyRunId }),
        ]);

        expect(populated.results).toEqual([
            expect.objectContaining({
                productId,
                position: { source: 'keepa', value: 1 },
                currentProduct: null,
                observed: expect.objectContaining({ rootCategoryBsr: 1234 }),
            }),
        ]);
        expect(empty).toMatchObject({ id: emptyRunId, resultCount: 0, results: [] });
    });

    it('derives per-ASIN SP-API pending state from the durable queue', async () => {
        const queryId = await insertQuery('Pending Product');
        const runId = await insertRun(queryId, '2026-07-01T12:00:00.000Z', 1);
        const productId = await insertProduct();
        await insertResult(runId, productId);
        const caller = appRouter.createCaller(createContext('app'));

        expect((await caller.api.app.catalog.run.get({ id: runId })).results[0]).toMatchObject({
            currentProductSyncPending: false,
        });

        await db.insert(spApiSyncQueue).values({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
        });
        expect(await caller.api.app.product.get({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
        })).toMatchObject({
            syncPending: true,
        });
        expect((await caller.api.app.catalog.run.get({ id: runId })).results[0]).toMatchObject({
            currentProductSyncPending: true,
        });

        await db.delete(spApiSyncQueue);
        expect(await caller.api.app.product.get({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
        })).toMatchObject({
            syncPending: false,
        });
    });
});

const insertQuery = async (displayTerm: string) => {
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: displayTerm.toLowerCase(),
            displayTerm,
            page: 0,
        })
        .returning({ id: catalogQueries.id });
    if (!query) {
        throw new Error('Test Catalog query was not created.');
    }
    return query.id;
};

const insertRun = async (queryId: string, completedAt: string, resultCount: number) => {
    const completedDate = new Date(completedAt);
    const [operation] = await db
        .insert(operations)
        .values({
            type: 'catalogSearch',
            targetKey: queryId,
            input: { queryId, trigger: 'requested' },
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
            sourceStartedAt: new Date(completedDate.getTime() - 60_000),
            sourceCompletedAt: completedDate,
            trigger: 'requested',
            resultCount,
            normalizerVersion: 1,
            createdAt: completedDate,
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
            completedAt: completedDate,
        })
        .where(eq(operations.id, operation.id));
    await db
        .update(catalogQueries)
        .set({ latestSuccessfulRunAt: completedDate })
        .where(eq(catalogQueries.id, queryId));
    return run.id;
};

const insertProduct = async () => {
    const [product] = await db
        .insert(products)
        .values({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            title: 'Canonical title at run time',
            keepaFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
            keepaCurrentBsr: 1234,
        })
        .returning({ id: products.id });
    if (!product) {
        throw new Error('Test Product was not created.');
    }
    return product.id;
};

const insertResult = async (runId: string, productId: string) => {
    await db.insert(catalogSearchResults).values({
        runId,
        productId,
        sourcePosition: 1,
        observedRootCategoryBsr: 1234,
        observedNewPrice: 1999,
        observedMonthlySold: 25,
        observedSourceUpdatedAt: new Date('2026-07-01T11:55:00.000Z'),
    });
};

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
