import { and, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';

const recentProductsInput = z.object({
    cursor: z
        .object({
            asin: z.string(),
            lastFetched: z.string().datetime(),
            marketplaceId: z.string(),
        })
        .nullish(),
    limit: z.number().int().min(10).max(100).default(50),
});

export const recentProducts = appProcedure
    .input(recentProductsInput.optional())
    .query(async ({ input }) => {
        const cursor = input?.cursor ?? null;
        const limit = input?.limit ?? 50;
        const cursorLastFetched = cursor ? new Date(cursor.lastFetched) : null;

        const rows = await db
            .select({
                asin: products.asin,
                title: products.title,
                thumbnailUrl: products.thumbnailUrl,
                brand: products.brand,
                marketplaceId: products.marketplaceId,
                rootCategoryBsr: products.rootCategoryBsr,
                lastFetched: products.lastFetched,
            })
            .from(products)
            .where(
                cursor && cursorLastFetched
                    ? or(
                          lt(products.lastFetched, cursorLastFetched),
                          and(
                              eq(products.lastFetched, cursorLastFetched),
                              or(
                                  lt(products.marketplaceId, cursor.marketplaceId),
                                  and(
                                      eq(products.marketplaceId, cursor.marketplaceId),
                                      lt(products.asin, cursor.asin)
                                  )
                              )
                          )
                      )
                    : undefined
            )
            .orderBy(
                desc(products.lastFetched),
                desc(products.marketplaceId),
                desc(products.asin)
            )
            .limit(limit + 1);

        const items = rows.slice(0, limit);
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
        };
    });
