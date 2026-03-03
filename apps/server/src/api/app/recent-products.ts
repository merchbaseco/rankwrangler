import { and, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { db } from '@/db/index.js';
import { productFacets, productFacetValues, products } from '@/db/schema.js';

const recentProductsInput = z.object({
	cursor: z
		.object({
			asin: z.string(),
			lastFetched: z.string().datetime(),
			marketplaceId: z.string(),
		})
		.nullish(),
	limit: z.number().int().min(10).max(100).default(50),
	search: z.string().trim().min(1).max(200).optional(),
});

type AvailableFacetRow = {
    facet: string;
    name: string;
    product_count: number;
};

export const recentProducts = appProcedure
    .input(recentProductsInput.optional())
    .query(async ({ input }) => {
		const cursor = input?.cursor ?? null;
		const limit = input?.limit ?? 50;
		const cursorCondition = buildCursorCondition(cursor);
		const searchCondition = buildSearchCondition(input?.search);
		const whereCondition =
			cursorCondition && searchCondition
				? and(cursorCondition, searchCondition)
				: cursorCondition ?? searchCondition;

        const rows = await db
			.select({
				asin: products.asin,
				title: products.title,
				thumbnailUrl: products.thumbnailUrl,
				brand: products.brand,
				bullet1: products.bullet1,
				bullet2: products.bullet2,
				marketplaceId: products.marketplaceId,
				rootCategoryBsr: products.rootCategoryBsr,
				dateFirstAvailable: products.dateFirstAvailable,
				isMerchListing: products.isMerchListing,
				facets: sql<string>`
                    COALESCE(
                        (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'facet', ${productFacetValues.facet},
                                    'name', ${productFacetValues.name}
                                )
                                ORDER BY ${productFacetValues.facet}, ${productFacetValues.name}
                            )
                            FROM ${productFacets}
                            INNER JOIN ${productFacetValues}
                                ON ${productFacets.facetValueId} = ${productFacetValues.id}
                            WHERE ${productFacets.productId} = ${products.id}
                        ),
                        '[]'::jsonb
                    )::text
                `.mapWith((value) =>
					JSON.parse(value) as Array<{ facet: string; name: string }>
				),
				lastFetched: products.lastFetched,
			})
			.from(products)
			.where(whereCondition)
            .orderBy(desc(products.lastFetched), desc(products.marketplaceId), desc(products.asin))
            .limit(limit + 1);

        const items = rows.slice(0, limit);
        let trackedTotals: { totalMerchProducts: number; totalProducts: number } | null = null;
        let availableFacets: Array<{ facet: string; name: string }> | null = null;

        if (!cursor) {
            const [trackedTotalsResult, availableFacetRows] = await Promise.all([
                queryTrackedTotals(),
                queryAvailableFacetValues(),
            ]);
            trackedTotals = trackedTotalsResult;
            availableFacets = availableFacetRows.map((row) => ({
                facet: row.facet,
                name: row.name,
            }));
        }

        const nextRow = rows.length > limit ? items[items.length - 1] : null;
        const nextCursor = nextRow
            ? {
					asin: nextRow.asin,
					lastFetched: nextRow.lastFetched.toISOString(),
					marketplaceId: nextRow.marketplaceId,
				}
			: null;

		return {
            items,
            nextCursor,
            trackedTotals,
            availableFacets,
        };
    });

const buildCursorCondition = (
	cursor: {
		asin: string;
		lastFetched: string;
		marketplaceId: string;
	} | null,
): SQL | undefined => {
	if (!cursor) {
		return undefined;
	}

	const cursorLastFetched = new Date(cursor.lastFetched);
	return or(
		lt(products.lastFetched, cursorLastFetched),
		and(
			eq(products.lastFetched, cursorLastFetched),
			or(
				lt(products.marketplaceId, cursor.marketplaceId),
				and(eq(products.marketplaceId, cursor.marketplaceId), lt(products.asin, cursor.asin)),
			),
		),
	);
};

const buildSearchCondition = (search: string | undefined): SQL | undefined => {
	const tokens = splitSearchTokens(search);
	if (tokens.length === 0) {
		return undefined;
	}

	const tokenConditions = tokens.map((token) => {
		const pattern = `%${token}%`;
		return or(
			ilike(products.asin, pattern),
			ilike(products.brand, pattern),
			ilike(products.title, pattern),
		);
	});

	return tokenConditions.length === 1 ? tokenConditions[0] : and(...tokenConditions);
};

const splitSearchTokens = (search: string | undefined) =>
	search
		? search
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 8)
			: [];

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
    const rows = await db.execute<AvailableFacetRow>(sql`
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
