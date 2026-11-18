import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { db } from '@/db/index';
import { keywordProducts } from '@/db/keyword-collection-schema';
import { acceptKeywordObservation } from '@/db/keyword-observation';
import { syncKeywordTargets } from '@/db/keyword-target-sync';
import { markProductsDeleted } from '@/db/product/get-products';
import { mergeProducts } from '@/db/product/merge-products';
import { products } from '@/db/product-schema';
import {
    discoveryNow as now,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
    syncDiscoveryFixture,
} from './discovery-fixture';

const market = 'ATVPDKIKX0DER';

// Each write path that changes a keyword's inputs leaves its directory row as a full re-sync would.
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('stored keyword answers', () => {
    beforeEach(resetDiscoveryFixture);

    it('recounts and re-shelves every keyword a Product merge touches', async () => {
        const fishing = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing dad' });
        const golf = await seedDiscoveryTarget({ kind: 'keyword', term: 'golf dad' });
        const survivor = await insertProduct('B0MERGE001', { isMerchListing: false });
        const other = await insertProduct('B0MERGE002', { rootCategoryBsr: 9_000 });
        await retain(fishing.queryId, [survivor, other]);
        await retain(golf.queryId, [other]);
        await setHeads(fishing.id, [other, survivor]);
        await setHeads(golf.id, [other]);
        await syncDiscoveryFixture();
        expect(await directory()).toEqual({
            'fishing dad': { products: 2, merch: 1, median: 9_000 },
            'golf dad': { products: 1, merch: 1, median: 9_000 },
        });

        await db.transaction(tx => mergeProducts(tx, { survivorId: survivor, otherId: other }));

        // The survivor is Merch now (merge ORs the verdict) and replaces the other everywhere.
        expect(await directory()).toEqual({
            'fishing dad': { products: 1, merch: 1, median: 5_000 },
            'golf dad': { products: 1, merch: 1, median: 5_000 },
        });
        expect(await drift()).toEqual([]);
        const [target] = await db
            .select({ heads: discoveryTargets.headProductIds })
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, fishing.id));
        expect(target.heads).toEqual([survivor]);
    });

    it('recounts a keyword when a Catalog search retains Products for its query', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'camping mom' });
        await syncDiscoveryFixture();
        const ids = [await insertProduct('B0CATLG001'), await insertProduct('B0CATLG002')];
        await db.transaction(tx =>
            acceptKeywordObservation(tx, {
                queryId: target.queryId,
                runId: crypto.randomUUID(),
                page: 1,
                completedAt: now,
                resultCount: ids.length,
                productIds: ids,
            })
        );
        expect((await directory())['camping mom']).toMatchObject({ products: 2, merch: 2 });
        expect(await drift()).toEqual([]);
    });

    it('recounts a keyword in the same transaction that marks its Product deleted', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'nurse life' });
        const id = await insertProduct('B0DELETE01');
        await retain(target.queryId, [id]);
        await syncDiscoveryFixture();
        expect((await directory())['nurse life']).toMatchObject({ merch: 1 });
        await markProductsDeleted([{ marketplaceId: market, asin: 'B0DELETE01' }], now);
        expect((await directory())['nurse life']).toMatchObject({ products: 1, merch: 0 });
        expect(await drift()).toEqual([]);
    });
});

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [row] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            isMerchListing: true,
            amazonListingStatus: 'active',
            rootCategoryBsr: 5_000,
            ...extra,
        })
        .returning({ id: products.id });
    return row.id;
};

const retain = (queryId: string, productIds: string[]) =>
    db.insert(keywordProducts).values(
        productIds.map(productId => ({
            queryId,
            productId,
            firstObservedAt: now,
            lastObservedAt: now,
        }))
    );

const setHeads = (targetId: string, ids: string[]) =>
    db
        .update(discoveryTargets)
        .set({ headProductIds: ids, headObservedAt: now })
        .where(eq(discoveryTargets.id, targetId));

const directory = async () =>
    Object.fromEntries(
        (
            await db.execute<{ term: string; products: number; merch: number; median: number }>(
                sql`select term,product_count products,merch_count merch,shelf_median_bsr median
                    from keyword_directory order by term`
            )
        ).map(({ term, ...row }) => [term, row])
    );

// Directory rows that differ from what a full re-sync derives now.
const drift = () =>
    db.transaction(async tx => {
        const before = await tx.execute(sql`select * from keyword_directory order by query_id`);
        const ids = await tx.select({ id: discoveryTargets.id }).from(discoveryTargets);
        await syncKeywordTargets(
            tx,
            ids.map(row => row.id),
            'all'
        );
        const after = await tx.execute(sql`select * from keyword_directory order by query_id`);
        return after.filter((row, index) => JSON.stringify(row) !== JSON.stringify(before[index]));
    });
