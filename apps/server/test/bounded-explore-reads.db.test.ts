import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { productSearchFacetsInput, productSearchInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { searchStoredProducts } from '@/db/product-search';
import { productFacetStatement } from '@/db/product-search-facet-sql';
import {
    defaultFacetsInput,
    refreshProductSearchFacetSnapshot,
} from '@/db/product-search-facet-snapshot';
import { readProductSearchFacets } from '@/db/product-search-facets';
import { productSearchFilters } from '@/db/product-search-filters';
import { scopeFilters } from '@/db/product-search-scope';
import { InvalidProductSearchCursorError } from '@/db/product-search-sort';
import { catalogQueries, keywordProducts, products } from '@/db/schema';
import { readCachedProductSearchFacets } from '@/services/dashboard-aggregates';

const market = 'ATVPDKIKX0DER';
const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 86_400_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('bounded Explore reads', () => {
    beforeEach(async () => {
        await db.execute(sql`truncate products, catalog_queries, product_facet_values cascade`);
        await db.execute(sql`delete from product_search_facet_snapshot`);
    });

    it('matches a term on titles per row exactly as the index lookup does', async () => {
        const title = await insertProduct('B0TEXT0001', { title: 'Fishing grandpa shirt' });
        await insertProduct('B0TEXT0002', { title: 'Golf shirt', bullet1: 'for fishing fans' });
        await insertProduct('B0TEXT0003', { title: 'Unrelated', brand: 'Fishing Co' });
        const member = await insertProduct('B0TEXT0004', { title: 'Nothing textual' });
        await insertProduct('B0TEXT0005', { title: 'Plain shirt' });
        const [query] = await db
            .insert(catalogQueries)
            .values({
                source: 'keepa',
                marketplaceId: market,
                normalizedTerm: 'fishing',
                displayTerm: 'fishing',
            })
            .returning({ id: catalogQueries.id });
        await db.insert(keywordProducts).values({
            queryId: query.id,
            productId: member,
            firstObservedAt: NOW,
            lastObservedAt: NOW,
        });
        const ids = async (input: object, form: 'lookup' | 'row') =>
            db.execute<{ id: string }>(sql`select id from products
                where ${productSearchFilters(productSearchFacetsInput.parse(input), NOW, form).where}
                order by id`);
        for (const input of [
            { term: 'fishing' },
            { term: 'B0TEXT0005' },
            { term: 'fishing', excludeWords: ['grandpa'] },
        ]) {
            expect(await ids(input, 'row')).toEqual(await ids(input, 'lookup'));
        }
        // Bullet, brand and keyword-member matches stay out; only the title match is found.
        expect(await ids({ term: 'fishing' }, 'lookup')).toEqual([{ id: title }]);
    });

    it('serves the default facets from the snapshot and bounds deep pages', async () => {
        for (let index = 0; index < 12; index += 1) {
            await insertProduct(`B0FACET${String(index).padStart(3, '0')}`, {
                rootCategoryBsr: 1_000 + index * 40_000,
                keepaMonthlySold: index * 100,
                dateFirstAvailable: new Date(NOW.getTime() - index * 9 * DAY),
            });
        }
        const exhaustive = await readProductSearchFacets(defaultFacetsInput, NOW, {
            exhaustive: true,
        });
        expect(await readProductSearchFacets(defaultFacetsInput, NOW)).toEqual(exhaustive);
        await refreshProductSearchFacetSnapshot(NOW);
        expect(await readCachedProductSearchFacets(defaultFacetsInput)).toEqual(exhaustive);
        expect(exhaustive).toMatchObject({ total: 12, totalIsEstimate: false });
        // A block sample of a table smaller than the page budget reads every page: same counts.
        for (const input of [
            defaultFacetsInput,
            productSearchFacetsInput.parse({ term: 'shirt' }),
        ]) {
            const read = (scope: 'all' | 'sample') =>
                db.execute(
                    productFacetStatement({
                        base: scopeFilters(input, NOW, scope).base,
                        input,
                        limit: sql``,
                        now: NOW,
                        scope,
                    })
                );
            expect(await read('sample')).toEqual(await read('all'));
        }

        await expect(
            searchStoredProducts({
                ...productSearchInput.parse({ sort: 'salesRankAsc' }),
                page: 202,
                pageSize: 50,
            })
        ).rejects.toBeInstanceOf(InvalidProductSearchCursorError);
    });
});

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [row] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            title: 'Shirt',
            brand: 'Independent Studio',
            isMerchListing: true,
            rootCategoryBsr: 5_000,
            ...extra,
        })
        .returning({ id: products.id });
    return row.id;
};
