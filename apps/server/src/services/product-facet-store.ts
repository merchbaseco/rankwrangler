import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
    productFacets,
    productFacetValues,
    products,
} from '@/db/schema.js';
import {
    productFacetKeys,
    type ProductFacetClassification,
    type ProductFacetKey,
} from '@/services/product-facet-taxonomy.js';

export type ProductFacetEntry = {
    facet: ProductFacetKey;
    name: string;
};

export const replaceProductFacetsByMarketplaceAsin = async ({
    asin,
    classification,
    marketplaceId,
}: {
    asin: string;
    classification: ProductFacetClassification;
    marketplaceId: string;
}) => {
    const product = await db
        .select({
            id: products.id,
        })
        .from(products)
        .where(
            and(
                eq(products.marketplaceId, marketplaceId),
                eq(products.asin, asin)
            )
        )
        .limit(1);

    const productId = product[0]?.id;
    if (!productId) {
        return { updated: false, reason: 'product_missing' } as const;
    }

    const facetEntries = flattenClassification(classification);

    await db.transaction(async (tx) => {
        await tx
            .delete(productFacets)
            .where(eq(productFacets.productId, productId));

        if (facetEntries.length > 0) {
            const facetValueIds = await findOrCreateFacetValueIds(tx, facetEntries);
            if (facetValueIds.length > 0) {
                await tx
                    .insert(productFacets)
                    .values(
                        facetValueIds.map((facetValueId) => ({
                            productId,
                            facetValueId,
                        }))
                    )
                    .onConflictDoNothing();
            }
        }

        await tx
            .update(products)
            .set({
                facetsState: 'ready',
                facetsUpdatedAt: new Date(),
            })
            .where(eq(products.id, productId));
    });

    return {
        updated: true,
        entriesCount: facetEntries.length,
    } as const;
};

export const markProductFacetClassificationError = async ({
    asin,
    marketplaceId,
}: {
    asin: string;
    marketplaceId: string;
}) => {
    await db
        .update(products)
        .set({
            facetsState: 'error',
        })
        .where(
            and(
                eq(products.marketplaceId, marketplaceId),
                eq(products.asin, asin)
            )
        );
};

export const flattenClassification = (
    classification: ProductFacetClassification
): ProductFacetEntry[] => {
    const seen = new Set<string>();
    const entries: ProductFacetEntry[] = [];

    for (const facet of productFacetKeys) {
        for (const value of classification[facet]) {
            const normalizedValue = normalizeFacetValue(value);
            if (!normalizedValue) {
                continue;
            }

            const dedupeKey = `${facet}:${normalizedValue}`;
            if (seen.has(dedupeKey)) {
                continue;
            }

            seen.add(dedupeKey);
            entries.push({
                facet,
                name: normalizedValue,
            });
        }
    }

    return entries;
};

export const normalizeFacetValue = (value: string) => {
    const normalized = value
        .toLowerCase()
        .trim()
        .replace(/['".,!?()]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return normalized.length > 0 ? normalized : null;
};

const findOrCreateFacetValueIds = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    facetEntries: ProductFacetEntry[]
) => {
    const insertedRows = await tx
        .insert(productFacetValues)
        .values(
            facetEntries.map((entry) => ({
                facet: entry.facet,
                name: entry.name,
            }))
        )
        .onConflictDoNothing()
        .returning({
            id: productFacetValues.id,
            facet: productFacetValues.facet,
            name: productFacetValues.name,
        });

    const insertedByKey = new Map(
        insertedRows.map((row) => [`${row.facet}:${row.name}`, row.id])
    );
    const missingKeys = facetEntries
        .map((entry) => `${entry.facet}:${entry.name}`)
        .filter((key) => !insertedByKey.has(key));

    let existingRows: Array<{
        id: string;
        facet: string;
        name: string;
    }> = [];
    if (missingKeys.length > 0) {
        const conditions = facetEntries.map((entry) =>
            and(
                eq(productFacetValues.facet, entry.facet),
                eq(productFacetValues.name, entry.name)
            )
        );
        existingRows = await tx
            .select({
                id: productFacetValues.id,
                facet: productFacetValues.facet,
                name: productFacetValues.name,
            })
            .from(productFacetValues)
            .where(conditions.length === 1 ? conditions[0] : or(...conditions));
    }

    const existingByKey = new Map(
        existingRows.map((row) => [`${row.facet}:${row.name}`, row.id])
    );

    return facetEntries
        .map((entry) => {
            const key = `${entry.facet}:${entry.name}`;
            return insertedByKey.get(key) ?? existingByKey.get(key) ?? null;
        })
        .filter((id): id is string => Boolean(id));
};
