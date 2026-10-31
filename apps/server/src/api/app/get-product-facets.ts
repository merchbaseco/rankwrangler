import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { db } from '@/db/index.js';
import { familyProductId } from '@/db/product/product-family';

const getProductFacetsInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
});

/** The family's niche facets in one statement, category then value order. */
export const getProductFacets = appProcedure
    .input(getProductFacetsInput)
    .query(async ({ input }) => [
        ...(await db.execute<{ facet: string; name: string }>(sql`
            select v.facet,v.name from product_facets f
            join product_facet_values v on v.id=f.facet_value_id
            where f.product_id=${familyProductId(input)}
            order by v.facet,v.name`)),
    ]);
