import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { products, spApiSyncQueue } from '@/db/schema';

export type ProductIdentity = {
    marketplaceId: string;
    asin: string;
};

export type StoredProduct = typeof products.$inferSelect;

export type StoredProductRead = {
    product: StoredProduct;
    queuePending: boolean;
};

export const getStoredProducts = async (
    identities: ProductIdentity[]
): Promise<StoredProductRead[]> => {
    if (identities.length === 0) {
        return [];
    }

    const identityCondition = or(
        ...identities.map(identity =>
            and(
                eq(products.marketplaceId, identity.marketplaceId),
                eq(products.asin, identity.asin)
            )
        )
    );
    if (!identityCondition) {
        return [];
    }

    const rows = await db
        .select({
            product: products,
            queueId: spApiSyncQueue.id,
        })
        .from(products)
        .leftJoin(
            spApiSyncQueue,
            and(
                eq(spApiSyncQueue.marketplaceId, products.marketplaceId),
                eq(spApiSyncQueue.asin, products.asin)
            )
        )
        .where(identityCondition);

    return rows.map(row => ({
        product: row.product,
        queuePending: row.queueId !== null,
    }));
};

export const ensureProductIdentities = async (identities: ProductIdentity[]) => {
    if (identities.length === 0) {
        return 0;
    }

    const inserted = await db
        .insert(products)
        .values(identities)
        .onConflictDoNothing()
        .returning({ id: products.id });

    return inserted.length;
};

export const markProductsUnavailable = async (
    identities: ProductIdentity[],
    resolvedAt: Date
) => {
    if (identities.length === 0) {
        return 0;
    }

    const identityCondition = or(
        ...identities.map(identity =>
            and(
                eq(products.marketplaceId, identity.marketplaceId),
                eq(products.asin, identity.asin)
            )
        )
    );
    if (!identityCondition) {
        return 0;
    }

    const updated = await db
        .update(products)
        .set({ isUnavailable: true, spApiResolvedAt: resolvedAt })
        .where(identityCondition)
        .returning({ id: products.id });

    return updated.length;
};
