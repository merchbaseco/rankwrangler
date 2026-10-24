import { eq, sql } from 'drizzle-orm';
import { appProcedure } from '@/api/trpc';
import { db } from '@/db/index';
import { products } from '@/db/product-schema';

export const productSearchMetadata = appProcedure.query(async () => {
    const [trackedTotals, availableFacets] = await Promise.all([
        queryTrackedTotals(),
        queryAvailableFacetValues(),
    ]);
    return {
        trackedTotals,
        availableFacets: availableFacets.map(({ facet, name }) => ({ facet, name })),
    };
});

const queryTrackedTotals = async () => {
    const [totalProductsRows, totalMerchProductsRows] = await Promise.all([
        db.select({ total: sql<number>`count(*)::int` }).from(products),
        db
            .select({ total: sql<number>`count(*)::int` })
            .from(products)
            .where(eq(products.isMerchListing, true)),
    ]);

    return {
        totalMerchProducts: totalMerchProductsRows[0]?.total ?? 0,
        totalProducts: totalProductsRows[0]?.total ?? 0,
    };
};

const queryAvailableFacetValues = async () => {
    const rows = await db.execute<{ facet: string; name: string; product_count: number }>(sql`
        SELECT
            pfv.facet,
            pfv.name,
            count(DISTINCT pf.product_id)::int AS product_count
        FROM product_facet_values pfv
        INNER JOIN product_facets pf
            ON pf.facet_value_id = pfv.id
        GROUP BY pfv.id, pfv.facet, pfv.name
        ORDER BY product_count DESC, pfv.facet ASC, pfv.name ASC
    `);

    return [...rows];
};
