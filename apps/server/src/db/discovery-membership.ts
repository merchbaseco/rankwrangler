import { and, eq, inArray } from 'drizzle-orm';
import { brandDiscoveryProducts, type discoveryTargets } from './discovery-target-schema';
import { keywordProducts } from './keyword-collection-schema';
import type { db } from './index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const recordDiscoveryMembership = async (
    tx: Transaction,
    input: {
        target: typeof discoveryTargets.$inferSelect;
        productIds: string[];
        merchProductIds: string[];
        observedAt: Date;
    }
) => {
    if (!input.productIds.length) return 0;
    const { target, observedAt, productIds } = input;
    const added =
        target.kind === 'keyword'
            ? await tx
                  .insert(keywordProducts)
                  .values(
                      productIds.map(productId => ({
                          queryId: target.queryId,
                          productId,
                          firstObservedAt: observedAt,
                          lastObservedAt: observedAt,
                      }))
                  )
                  .onConflictDoNothing()
                  .returning({ productId: keywordProducts.productId })
            : await tx
                  .insert(brandDiscoveryProducts)
                  .values(
                      productIds.map(productId => ({
                          targetId: target.id,
                          productId,
                          firstObservedAt: observedAt,
                          lastObservedAt: observedAt,
                      }))
                  )
                  .onConflictDoNothing()
                  .returning({ productId: brandDiscoveryProducts.productId });
    if (target.kind === 'keyword')
        await tx
            .update(keywordProducts)
            .set({ lastObservedAt: observedAt })
            .where(
                and(
                    eq(keywordProducts.queryId, target.queryId),
                    inArray(keywordProducts.productId, productIds)
                )
            );
    else
        await tx
            .update(brandDiscoveryProducts)
            .set({ lastObservedAt: observedAt })
            .where(
                and(
                    eq(brandDiscoveryProducts.targetId, target.id),
                    inArray(brandDiscoveryProducts.productId, productIds)
                )
            );
    const merch = new Set(input.merchProductIds);
    return added.filter(row => merch.has(row.productId)).length;
};
