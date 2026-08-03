import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { lockCatalogQueryForReconciliation } from '@/db/catalog-query-resolution';
import { resolveCatalogSearchRequest } from '@/db/catalog-search';
import { listStalePendingCatalogSearchOperations } from '@/db/catalog-search-operations';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    rankwranglerServiceAccounts,
} from '@/db/schema';

const SERVICE_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-07-24T12:00:00.000Z');
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Catalog search transaction boundaries', () => {
    beforeEach(async () => {
        await db.delete(catalogSearchResults);
        await db.delete(catalogSearchRuns);
        await db.delete(operations);
        await db.delete(catalogQueries);
        await db.delete(rankwranglerServiceAccounts);
    });

    it('never publishes, joins, or recovers work while service-account accounting is paused or rejected', async () => {
        await insertServiceAccount(0);
        const billingEntered = createDeferred();
        const continueBilling = createDeferred();

        const firstRequest = resolveCatalogSearchRequest(createRequest(), {
            beforeUsageCharge: async () => {
                billingEntered.resolve();
                await continueBilling.promise;
            },
        });
        await billingEntered.promise;

        expect(await listStalePendingCatalogSearchOperations(NOW)).toEqual([]);
        expect(await listCatalogOperations()).toEqual([]);

        let joinSettled = false;
        const joiningRequest = resolveCatalogSearchRequest(createRequest()).finally(() => {
            joinSettled = true;
        });
        await Bun.sleep(50);
        expect(joinSettled).toBe(false);

        continueBilling.resolve();
        expect(await firstRequest).toEqual({
            kind: 'billingRejected',
            reason: 'usageLimitExceeded',
            usageLimit: 0,
        });
        expect(await joiningRequest).toEqual({
            kind: 'billingRejected',
            reason: 'usageLimitExceeded',
            usageLimit: 0,
        });
        expect(await listCatalogOperations()).toEqual([]);
        expect(await listStalePendingCatalogSearchOperations(NOW)).toEqual([]);
        expect(await readUsageToday()).toBe(0);
    });

    it('returns a completion already holding the query lock without charging or creating work', async () => {
        await insertServiceAccount(5);
        const [query] = await db
            .insert(catalogQueries)
            .values({
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: 'shirts',
                displayTerm: 'shirts',
                page: 0,
            })
            .returning({ id: catalogQueries.id });
        if (!query) {
            throw new Error('Test Catalog query was not created.');
        }

        const [operation] = await db
            .insert(operations)
            .values({
                type: 'catalogSearch',
                targetKey: query.id,
                input: {
                    queryId: query.id,
                    marketplaceId: 'ATVPDKIKX0DER',
                    term: 'shirts',
                    page: 0,
                    priority: 'interactive',
                    trigger: 'requested',
                },
            })
            .returning({ id: operations.id });
        if (!operation) {
            throw new Error('Test Operation was not created.');
        }

        const completionReady = createDeferred<string>();
        const allowCommit = createDeferred();
        const completion = db.transaction(async transaction => {
            await lockCatalogQueryForReconciliation(transaction, query.id);
            const [run] = await transaction
                .insert(catalogSearchRuns)
                .values({
                    queryId: query.id,
                    operationId: operation.id,
                    sourceStartedAt: new Date('2026-07-24T11:59:00.000Z'),
                    sourceCompletedAt: NOW,
                    trigger: 'requested',
                    resultCount: 0,
                    normalizerVersion: 1,
                })
                .returning({ id: catalogSearchRuns.id });
            if (!run) {
                throw new Error('Test Catalog Search run was not created.');
            }

            await transaction
                .update(operations)
                .set({
                    status: 'completed',
                    resource: {
                        type: 'catalogSearchRun',
                        queryId: query.id,
                        runId: run.id,
                    },
                    completedAt: NOW,
                    updatedAt: NOW,
                })
                .where(eq(operations.id, operation.id));
            completionReady.resolve(run.id);
            await allowCommit.promise;
            await transaction
                .update(catalogQueries)
                .set({
                    latestSuccessfulRunAt: NOW,
                    updatedAt: NOW,
                })
                .where(eq(catalogQueries.id, query.id));
            return run.id;
        });
        const runId = await completionReady.promise;

        let requestSettled = false;
        const request = resolveCatalogSearchRequest(createRequest()).finally(() => {
            requestSettled = true;
        });
        await Bun.sleep(50);
        expect(requestSettled).toBe(false);
        expect(await readUsageToday()).toBe(0);

        allowCommit.resolve();
        expect(await completion).toBe(runId);
        expect(await request).toEqual({ kind: 'ready', runId });
        expect(await listCatalogOperations()).toHaveLength(1);
        expect(await readUsageToday()).toBe(0);
    });
});

const createRequest = () => ({
    source: 'keepa' as const,
    marketplaceId: 'ATVPDKIKX0DER' as const,
    normalizedTerm: 'shirts',
    displayTerm: 'shirts',
    page: 0 as const,
    maxAgeSeconds: 86_400,
    priority: 'interactive' as const,
    trigger: 'requested' as const,
    serviceAccountId: SERVICE_ACCOUNT_ID,
    ownerMerchbaseUserId: 'mbu_catalog_test',
    now: new Date('2026-07-24T12:01:00.000Z'),
});

const insertServiceAccount = async (usageLimit: number) => {
    await db.insert(rankwranglerServiceAccounts).values({
        id: SERVICE_ACCOUNT_ID,
        merchbaseUserId: 'mbu_catalog_test',
        usageLimit,
        lastResetAt: NOW,
    });
};

const listCatalogOperations = async () => {
    return await db
        .select({ id: operations.id })
        .from(operations)
        .where(eq(operations.type, 'catalogSearch'));
};

const readUsageToday = async () => {
    const [account] = await db
        .select({ usageToday: rankwranglerServiceAccounts.usageToday })
        .from(rankwranglerServiceAccounts)
        .where(eq(rankwranglerServiceAccounts.id, SERVICE_ACCOUNT_ID))
        .limit(1);
    return account?.usageToday ?? null;
};

const createDeferred = <T = void>() => {
    let resolvePromise!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(resolve => {
        resolvePromise = resolve;
    });
    return {
        promise,
        resolve: (value?: T) => resolvePromise(value as T),
    };
};
