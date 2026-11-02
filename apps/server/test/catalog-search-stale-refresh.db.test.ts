import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { resolveCatalogSearchRequest } from '@/db/catalog-search';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    rankwranglerServiceAccounts,
} from '@/db/schema';

const SERVICE_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-07-24T12:00:00.000Z');
const isDedicatedCatalogTestDatabase =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test';
const describeCatalogDb = isDedicatedCatalogTestDatabase ? describe : describe.skip;

describeCatalogDb('Catalog search stale evidence', () => {
    beforeEach(async () => {
        await db.delete(catalogSearchResults);
        await db.delete(catalogSearchRuns);
        await db.delete(operations);
        await db.delete(catalogQueries);
        await db.delete(rankwranglerServiceAccounts);
        await db.insert(rankwranglerServiceAccounts).values({
            id: SERVICE_ACCOUNT_ID,
            merchbaseUserId: 'mbu_stale_test',
            usageLimit: 10,
            lastResetAt: NOW,
        });
    });

    it('queues the refresh of evidence it answers from as background head work', async () => {
        const staleRunId = await insertRunAgedHours(72);

        const resolution = await resolveCatalogSearchRequest({ ...request, serveStale: true });

        expect(resolution).toMatchObject({ kind: 'pending', created: true, staleRunId });
        expect(await readOperationInput()).toMatchObject({
            priority: 'scheduled',
            workClass: 'head',
        });
    });

    it('keeps a refresh someone waits for interactive', async () => {
        await insertRunAgedHours(72);

        await resolveCatalogSearchRequest({ ...request, serveStale: false });

        expect(await readOperationInput()).toMatchObject({
            priority: 'interactive',
            workClass: 'interactive',
        });
    });

    it('serves stale evidence without upgrading queued background work', async () => {
        await insertRunAgedHours(72);
        await resolveCatalogSearchRequest({ ...request, serveStale: true });

        const joined = await resolveCatalogSearchRequest({ ...request, serveStale: true });

        expect(joined).toMatchObject({ kind: 'pending', created: false });
        expect(await readOperationInput()).toMatchObject({ priority: 'scheduled' });
    });
});

const request = {
    source: 'keepa' as const,
    marketplaceId: 'ATVPDKIKX0DER' as const,
    normalizedTerm: 'stale shirts',
    displayTerm: 'stale shirts',
    page: 0 as const,
    maxAgeSeconds: 86_400,
    priority: 'interactive' as const,
    trigger: 'requested' as const,
    serviceAccountId: SERVICE_ACCOUNT_ID,
    ownerMerchbaseUserId: 'mbu_stale_test',
    now: NOW,
};

const insertRunAgedHours = async (hours: number) => {
    const completedAt = new Date(NOW.getTime() - hours * 60 * 60 * 1000);
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: request.normalizedTerm,
            displayTerm: request.displayTerm,
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
                term: request.displayTerm,
                page: 0,
                priority: 'scheduled',
                trigger: 'automatic',
            },
        })
        .returning({ id: operations.id });
    if (!operation) throw new Error('Test Operation was not created.');
    const [run] = await db
        .insert(catalogSearchRuns)
        .values({
            queryId: query.id,
            operationId: operation.id,
            sourceStartedAt: new Date(completedAt.getTime() - 60_000),
            sourceCompletedAt: completedAt,
            trigger: 'automatic',
            resultCount: 0,
            normalizerVersion: 1,
            createdAt: completedAt,
        })
        .returning({ id: catalogSearchRuns.id });
    if (!run) throw new Error('Test Catalog Search run was not created.');
    await db
        .update(operations)
        .set({
            status: 'completed',
            resource: { type: 'catalogSearchRun', runId: run.id },
            completedAt,
        })
        .where(eq(operations.id, operation.id));
    return run.id;
};

const readOperationInput = async () => {
    const [pending] = await db
        .select({ input: operations.input })
        .from(operations)
        .where(eq(operations.status, 'pending'));
    return pending?.input;
};
