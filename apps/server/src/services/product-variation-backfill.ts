import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { CatalogCapacityDeferredError } from '@/services/discovery-types';
import { persistProductSyncResults } from '@/services/product-retrieval';
import { searchCatalogItemsByAsins } from '@/services/spapi/search-catalog-items-by-asins';

// Five catalog calls of 20 a minute (about 0.08 calls a second at background priority, behind
// every live request): ~47k stored Products take about eight hours, then the job finds nothing.
export const VARIATION_BACKFILL_BATCH_SIZE = 20;
export const VARIATION_BACKFILL_BATCHES_PER_RUN = 5;

type BackfillDeps = {
    readUnchecked: typeof readUncheckedProducts;
    searchCatalogItemsByAsins: typeof searchCatalogItemsByAsins;
    persistProductSyncResults: typeof persistProductSyncResults;
};

const defaultDeps: BackfillDeps = {
    readUnchecked: limit => readUncheckedProducts(limit),
    searchCatalogItemsByAsins,
    persistProductSyncResults,
};

/**
 * Re-reads stored Products whose variation relationships were never asked for. The normal product
 * write folds each variant into its parent family (merging duplicate rows and recording aliases),
 * so this only has to fetch them; it stops finding work once every Product has been checked.
 */
export const backfillProductVariations = async (deps: BackfillDeps = defaultDeps) => {
    let checked = 0;
    let batches = 0;
    for (; batches < VARIATION_BACKFILL_BATCHES_PER_RUN; batches += 1) {
        const identities = await deps.readUnchecked(VARIATION_BACKFILL_BATCH_SIZE);
        if (!identities.length) break;
        const marketplaceId = identities[0].marketplaceId;
        const batch = identities.filter(identity => identity.marketplaceId === marketplaceId);
        let fetched: Awaited<ReturnType<typeof searchCatalogItemsByAsins>>;
        try {
            fetched = await deps.searchCatalogItemsByAsins(
                marketplaceId,
                batch.map(identity => identity.asin),
                { priority: 'background' }
            );
        } catch (error) {
            // Paused sync or live work holds background capacity; try again next run.
            if (error instanceof CatalogCapacityDeferredError) break;
            throw error;
        }
        await deps.persistProductSyncResults({
            identities: batch,
            products: fetched,
            resolvedAt: new Date(),
        });
        checked += batch.length;
    }
    return { didWork: checked > 0, batches, checked };
};

const readUncheckedProducts = async (limit: number) =>
    await db
        .select({ marketplaceId: products.marketplaceId, asin: products.asin })
        .from(products)
        .where(and(isNull(products.variationsCheckedAt), eq(products.amazonListingStatus, 'active')))
        .orderBy(asc(products.createdAt))
        .limit(limit);
