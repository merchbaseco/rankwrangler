import { TRPCError } from '@trpc/server';
import {
    ensureProductIdentities,
    getStoredProducts,
    markProductsUnavailable,
    type ProductIdentity,
    type StoredProductRead,
} from '@/db/product/get-products';
import { mapStoredProductInfo } from '@/db/product/product-info-mapper';
import { upsertProductInfo } from '@/db/product/upsert-product';
import { deleteSpApiSyncQueueItemsForIdentities } from '@/db/spapi-sync-queue/delete-queue-items';
import { searchCatalogItemsByAsins } from '@/services/spapi/search-catalog-items-by-asins';
import type { ProductInfo, SpApiProduct } from '@/types';
import { PRODUCT_DEFAULT_MAX_AGE_MS } from './product-freshness-policy';
import { enqueueBackgroundProducts, resolveProduct } from './product-retrieval-work';
import { enqueueSpApiSyncQueueItems } from './spapi-sync-queue';

export type ProductFetchPolicy = 'blocking' | 'background';
export type ProductAvailability = 'pending' | 'available' | 'unavailable';

export interface ProductRetrieval {
    identity: ProductIdentity;
    product: ProductInfo | null;
    availability: ProductAvailability;
}

export interface PersistProductSyncResultsInput {
    identities: ProductIdentity[];
    products: SpApiProduct[];
    resolvedAt: Date;
}

interface PersistProductSyncResultsDeps {
    ensureProductIdentities: typeof ensureProductIdentities;
    upsertProductInfo: typeof upsertProductInfo;
    markProductsUnavailable: typeof markProductsUnavailable;
}

const defaultPersistProductSyncResultsDeps: PersistProductSyncResultsDeps = {
    ensureProductIdentities,
    upsertProductInfo,
    markProductsUnavailable,
};

export const persistProductSyncResults = async ({
    identities,
    products,
    resolvedAt,
}: PersistProductSyncResultsInput, deps = defaultPersistProductSyncResultsDeps) => {
    await deps.ensureProductIdentities(identities);
    const fetchedIdentities = new Set(products.map(product => productKey(product)));
    for (const product of products) {
        await deps.upsertProductInfo(product);
    }

    const unavailableIdentities = identities.filter(
        identity => !fetchedIdentities.has(productKey(identity))
    );
    await deps.markProductsUnavailable(unavailableIdentities, resolvedAt);
};

export interface ProductRetrievalDeps {
    getStoredProducts: typeof getStoredProducts;
    ensureProductIdentities: typeof ensureProductIdentities;
    enqueueSpApiSyncQueueItems: typeof enqueueSpApiSyncQueueItems;
    searchCatalogItemsByAsins: typeof searchCatalogItemsByAsins;
    persistProductSyncResults: typeof persistProductSyncResults;
    deleteSpApiSyncQueueItemsForIdentities?: typeof deleteSpApiSyncQueueItemsForIdentities;
}

const defaultDeps: ProductRetrievalDeps = {
    getStoredProducts,
    ensureProductIdentities,
    enqueueSpApiSyncQueueItems,
    searchCatalogItemsByAsins,
    persistProductSyncResults,
    deleteSpApiSyncQueueItemsForIdentities,
};

export const getProducts = async (
    {
        products: requestedProducts,
        fetchPolicy,
        maxAgeMs = PRODUCT_DEFAULT_MAX_AGE_MS,
        rediscoveredAt,
        signal,
        timeoutMs,
    }: {
        products: ProductIdentity[];
        fetchPolicy: ProductFetchPolicy;
        maxAgeMs?: number;
        rediscoveredAt?: Date;
        signal?: AbortSignal;
        timeoutMs?: number;
    },
    deps: ProductRetrievalDeps = defaultDeps
): Promise<ProductRetrieval[]> => {
    const identities = normalizeIdentities(requestedProducts);
    if (identities.length === 0) {
        return [];
    }

    const cutoff = new Date(Date.now() - Math.max(0, maxAgeMs));
    let stored = await deps.getStoredProducts(identities);
    const storedByKey = indexStoredProducts(stored);
    const needsResolution = identities.filter(identity =>
        shouldResolve(storedByKey.get(productKey(identity)), cutoff, rediscoveredAt)
    );

    if (fetchPolicy === 'blocking') {
        await Promise.all(
            needsResolution.map(identity => resolveProduct(identity, deps, signal, timeoutMs))
        );
        stored = needsResolution.length > 0 ? await deps.getStoredProducts(identities) : stored;
    } else if (needsResolution.length > 0) {
        await enqueueBackgroundProducts(needsResolution, storedByKey, deps);
        stored = await deps.getStoredProducts(identities);
    }

    const finalByKey = indexStoredProducts(stored);
    return identities.map(identity =>
        mapProductRetrieval(identity, finalByKey.get(productKey(identity)))
    );
};

export const getProductDetails = async (
    {
        marketplaceId,
        asin,
        maxAgeMs = PRODUCT_DEFAULT_MAX_AGE_MS,
        refresh = false,
        signal,
        timeoutMs,
    }: ProductIdentity & {
        maxAgeMs?: number;
        refresh?: boolean;
        signal?: AbortSignal;
        timeoutMs?: number;
    },
    deps: ProductRetrievalDeps = defaultDeps
): Promise<ProductRetrieval> => {
    const [identity] = normalizeIdentities([{ marketplaceId, asin }]);
    const [stored] = await deps.getStoredProducts([identity]);
    const result = mapProductRetrieval(identity, stored);
    const cutoff = new Date(Date.now() - Math.max(0, maxAgeMs));

    if (!(refresh || shouldResolve(stored, cutoff))) {
        return result;
    }

    if (result.availability === 'available' && !refresh) {
        enqueueBackgroundProducts(
            [identity],
            indexStoredProducts(stored ? [stored] : []),
            deps
        ).catch(() => undefined);
        return result;
    }

    await resolveProduct(identity, deps, signal, timeoutMs);
    const [refreshed] = await deps.getStoredProducts([identity]);
    return mapProductRetrieval(identity, refreshed);
};

export const getRequiredProduct = async (
    input: ProductIdentity & {
        maxAgeMs?: number;
        refresh?: boolean;
        signal?: AbortSignal;
        timeoutMs?: number;
    },
    deps: ProductRetrievalDeps = defaultDeps
) => {
    const result = await getProductDetails(input, deps);

    if (!result || result.availability !== 'available' || !result.product) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product info not available from Amazon catalog.',
        });
    }

    return result.product;
};

const mapProductRetrieval = (
    identity: ProductIdentity,
    stored: StoredProductRead | undefined
): ProductRetrieval => {
    return {
        identity,
        product: stored
            ? mapStoredProductInfo(stored.product, {
                  thumbnailPending: stored.queuePending && !stored.product.thumbnailUrl,
              })
            : null,
        availability: getAvailability(stored),
    };
};

const getAvailability = (stored: StoredProductRead | undefined): ProductAvailability => {
    if (!stored) {
        return 'pending';
    }
    if (stored.product.spApiFetchedAt) {
        return 'available';
    }
    if (stored.queuePending) {
        return 'pending';
    }
    if (stored.product.isUnavailable) {
        return 'unavailable';
    }
    return 'pending';
};

const shouldResolve = (
    stored: StoredProductRead | undefined,
    cutoff: Date,
    rediscoveredAt?: Date
) => {
    if (!stored) {
        return true;
    }

    if (stored.product.isUnavailable) {
        return Boolean(
            rediscoveredAt &&
                (!stored.product.spApiResolvedAt ||
                    stored.product.spApiResolvedAt < rediscoveredAt)
        );
    }

    const resolvedAt = getLatestSpApiTimestamp(stored.product);
    return !resolvedAt || resolvedAt < cutoff;
};

const getLatestSpApiTimestamp = (product: StoredProductRead['product']) => {
    if (!product.spApiFetchedAt) {
        return product.spApiResolvedAt;
    }
    if (!product.spApiResolvedAt) {
        return product.spApiFetchedAt;
    }

    return product.spApiFetchedAt >= product.spApiResolvedAt
        ? product.spApiFetchedAt
        : product.spApiResolvedAt;
};

const normalizeIdentities = (identities: ProductIdentity[]) => {
    const unique = new Map<string, ProductIdentity>();
    for (const identity of identities) {
        const normalized = {
            marketplaceId: identity.marketplaceId,
            asin: identity.asin.trim().toUpperCase(),
        };
        unique.set(productKey(normalized), normalized);
    }
    return Array.from(unique.values());
};

const indexStoredProducts = (stored: StoredProductRead[]) => {
    return new Map(stored.map(read => [productKey(read.product), read]));
};

const productKey = (identity: Pick<ProductIdentity, 'marketplaceId' | 'asin'>) =>
    `${identity.marketplaceId}:${identity.asin}`;
