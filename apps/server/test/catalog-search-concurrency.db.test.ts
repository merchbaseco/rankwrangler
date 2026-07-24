import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    licenses,
    operations,
} from '@/db/schema';
import {
    lockCatalogQueryForReconciliation,
    resolveCatalogSearchRequest,
} from '@/db/catalog-search';
import { listStalePendingCatalogSearchOperations } from '@/db/catalog-search-operations';

const LICENSE_ID = '33333333-3333-4333-8333-333333333333';
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
        await db.delete(licenses);
    });

    it('never publishes, joins, or recovers work while license accounting is paused or rejected', async () => {
        await insertLicense(0);
        const billingEntered = createDeferred();
        const continueBilling = createDeferred();

        const firstRequest = resolveCatalogSearchRequest(createRequest(), {
            beforeLicenseCharge: async () => {
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
        await insertLicense(5);
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
        if (!query) throw new Error('Test Catalog query was not created.');

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
                },
            })
            .returning({ id: operations.id });
        if (!operation) throw new Error('Test Operation was not created.');

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
                    resultCount: 0,
                    normalizerVersion: 1,
                })
                .returning({ id: catalogSearchRuns.id });
            if (!run) throw new Error('Test Catalog Search run was not created.');

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
    licenseId: LICENSE_ID,
    now: new Date('2026-07-24T12:01:00.000Z'),
});

const insertLicense = async (usageLimit: number) => {
    await db.insert(licenses).values({
        id: LICENSE_ID,
        key: 'rrk_catalog_concurrency_test',
        email: 'catalog-concurrency@example.com',
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
    const [license] = await db
        .select({ usageToday: licenses.usageToday })
        .from(licenses)
        .where(and(eq(licenses.id, LICENSE_ID), isNull(licenses.revokedAt)))
        .limit(1);
    return license?.usageToday ?? null;
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
