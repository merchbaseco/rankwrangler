import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { db } from '@/db/index.js';
import { productFacets, productFacetValues, products } from '@/db/schema.js';

const getProductFacetsInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
});

export const getProductFacets = appProcedure
    .input(getProductFacetsInput)
    .query(async ({ input }) => {
        const rows = await db
            .select({
                facet: productFacetValues.facet,
                name: productFacetValues.name,
            })
            .from(products)
            .innerJoin(productFacets, eq(productFacets.productId, products.id))
            .innerJoin(productFacetValues, eq(productFacetValues.id, productFacets.facetValueId))
            .where(
                and(
                    eq(products.marketplaceId, input.marketplaceId),
                    eq(products.asin, input.asin)
                )
            )
            .orderBy(productFacetValues.facet, productFacetValues.name);

        return rows;
    });
