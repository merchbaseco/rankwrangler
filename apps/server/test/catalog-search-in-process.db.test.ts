import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { mapOperationRecord } from '@/db/operations';
import { catalogQueries, catalogSearchResults, catalogSearchRuns, operations } from '@/db/schema';
import {
    type CatalogSearchOperation,
    dispatchCatalogSearchOperation,
    registerCatalogSearchRunner,
} from '@/services/catalog-search';

const describeCatalogDb =
    process.env.RUN_CATALOG_DB_TESTS === 'true' &&
    process.env.RANKWRANGLER_DATABASE_NAME === 'rankwrangler_catalog_test'
        ? describe
        : describe.skip;

describeCatalogDb('Catalog search dispatch', () => {
    const started: string[] = [];

    beforeEach(async () => {
        started.length = 0;
        registerCatalogSearchRunner(operationId => {
            started.push(operationId);
        });
        await db.delete(catalogSearchResults);
        await db.delete(catalogSearchRuns);
        await db.delete(operations);
        await db.delete(catalogQueries);
    });
    afterAll(() => registerCatalogSearchRunner(null));

    it('starts an interactive search in process at once, and only once', async () => {
        const operation = await insertOperation('interactive');

        expect(await dispatchCatalogSearchOperation(operation)).toBe(true);
        expect(await dispatchCatalogSearchOperation(operation)).toBe(false);

        expect(started).toEqual([operation.id]);
        const [row] = await db.select().from(operations).where(eq(operations.id, operation.id));
        expect(row?.dispatchedAt).not.toBeNull();
    });

    it('leaves scheduled searches to the queue', async () => {
        const operation = await insertOperation('scheduled');

        await dispatchCatalogSearchOperation(operation);

        expect(started).toEqual([]);
    });
});

const insertOperation = async (priority: 'interactive' | 'scheduled') => {
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: `in process ${priority}`,
            displayTerm: `in process ${priority}`,
        })
        .returning({ id: catalogQueries.id });
    if (!query) throw new Error('Test Catalog query was not created.');
    const [row] = await db
        .insert(operations)
        .values({
            type: 'catalogSearch',
            targetKey: query.id,
            input: {
                queryId: query.id,
                marketplaceId: 'ATVPDKIKX0DER',
                term: `in process ${priority}`,
                page: 0,
                priority,
                trigger: 'requested',
                ownerMerchbaseUserId: 'mbu_dispatch_test',
            },
        })
        .returning();
    if (!row) throw new Error('Test Operation was not created.');
    return mapOperationRecord(row) as CatalogSearchOperation;
};
