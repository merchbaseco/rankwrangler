import { TRPCError } from '@trpc/server';
import {
    ensureProductIdentities,
    getStoredProducts,
    markProductsSpApiResolved,
    type ProductIdentity,
    type StoredProductRead,
} from '@/db/product/get-products';
import { upsertProductInfo } from '@/db/product/upsert-product';
import { searchCatalogItemsByAsins } from '@/services/spapi/search-catalog-items-by-asins';
import type { ProductInfo, SpApiProduct } from '@/types';
import { mapStoredProductInfo } from '@/db/product/product-info-mapper';
import { enqueueSpApiSyncQueueItems } from './spapi-sync-queue';

export const PRODUCT_DEFAULT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export type ProductFetchPolicy = 'blocking' | 'background';
export type ProductAvailability = 'pending' | 'available' | 'unavailable';

export type ProductRetrieval = {
    identity: ProductIdentity;
    product: ProductInfo | null;
    availability: ProductAvailability;
};

export type PersistProductSyncResultsInput = {
    identities: ProductIdentity[];
    products: SpApiProduct[];
    resolvedAt: Date;
};

export const persistProductSyncResults = async ({
    identities,
    products,
    resolvedAt,
}: PersistProductSyncResultsInput) => {
    await ensureProductIdentities(identities);
    const fetchedIdentities = new Set(products.map(product => productKey(product)));
    for (const product of products) {
        await upsertProductInfo(product);
    }

    const unavailableIdentities = identities.filter(
        identity => !fetchedIdentities.has(productKey(identity))
    );
    await markProductsSpApiResolved(unavailableIdentities, resolvedAt);
};

type ProductRetrievalDeps = {
    getStoredProducts: typeof getStoredProducts;
    ensureProductIdentities: typeof ensureProductIdentities;
    enqueueSpApiSyncQueueItems: typeof enqueueSpApiSyncQueueItems;
    searchCatalogItemsByAsins: typeof searchCatalogItemsByAsins;
    persistProductSyncResults: typeof persistProductSyncResults;
};

const defaultDeps: ProductRetrievalDeps = {
    getStoredProducts,
    ensureProductIdentities,
    enqueueSpApiSyncQueueItems,
    searchCatalogItemsByAsins,
    persistProductSyncResults,
};

const productFetchInFlight = new Map<string, Promise<void>>();

export const getProducts = async (
    {
        products: requestedProducts,
        fetchPolicy,
        maxAgeMs = PRODUCT_DEFAULT_MAX_AGE_MS,
    }: {
        products: ProductIdentity[];
        fetchPolicy: ProductFetchPolicy;
        maxAgeMs?: number;
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
        shouldResolve(storedByKey.get(productKey(identity)), cutoff)
    );

    if (fetchPolicy === 'blocking') {
        await Promise.all(needsResolution.map(identity => resolveProduct(identity, deps)));
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

export const getRequiredProduct = async ({
    marketplaceId,
    asin,
    maxAgeMs,
}: ProductIdentity & { maxAgeMs?: number }) => {
    const [result] = await getProducts({
        products: [{ marketplaceId, asin }],
        fetchPolicy: 'blocking',
        maxAgeMs,
    });

    if (!result || result.availability !== 'available' || !result.product) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product info not available from Amazon catalog.',
        });
    }

    return result.product;
};

const resolveProduct = async (identity: ProductIdentity, deps: ProductRetrievalDeps) => {
    const key = productKey(identity);
    const existing = productFetchInFlight.get(key);
    if (existing) {
        return await existing;
    }

    const fetch = (async () => {
        await deps.ensureProductIdentities([identity]);
        const products = await deps.searchCatalogItemsByAsins(identity.marketplaceId, [
            identity.asin,
        ]);
        await deps.persistProductSyncResults({
            identities: [identity],
            products,
            resolvedAt: new Date(),
        });
    })().finally(() => {
        productFetchInFlight.delete(key);
    });
    productFetchInFlight.set(key, fetch);
    await fetch;
};

const enqueueBackgroundProducts = async (
    identities: ProductIdentity[],
    storedByKey: Map<string, StoredProductRead>,
    deps: ProductRetrievalDeps
) => {
    const missing = identities.filter(identity => !storedByKey.has(productKey(identity)));
    await deps.ensureProductIdentities(missing);

    const queueItems = identities.filter(identity => {
        return !storedByKey.get(productKey(identity))?.queuePending;
    });
    if (queueItems.length === 0) {
        return;
    }

    await deps.enqueueSpApiSyncQueueItems(queueItems);
};

const mapProductRetrieval = (
    identity: ProductIdentity,
    stored: StoredProductRead | undefined
): ProductRetrieval => {
    const hasLatestProviderData = stored ? hasLatestSpApiPayload(stored.product) : false;

    return {
        identity,
        product: stored
            ? mapStoredProductInfo(stored.product, {
                  thumbnailPending: stored.queuePending && !hasLatestProviderData,
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
        if (hasLatestSpApiPayload(stored.product)) {
            return 'available';
        }
    }
    if (stored.queuePending) {
        return 'pending';
    }
    if (stored.product.spApiResolvedAt) {
        return 'unavailable';
    }
    return 'pending';
};

const shouldResolve = (stored: StoredProductRead | undefined, cutoff: Date) => {
    if (!stored) {
        return true;
    }

    const resolvedAt = getLatestSpApiTimestamp(stored.product);
    return !resolvedAt || resolvedAt < cutoff;
};

const hasLatestSpApiPayload = (product: StoredProductRead['product']) => {
    if (!product.spApiFetchedAt) {
        return false;
    }

    return !product.spApiResolvedAt || product.spApiFetchedAt >= product.spApiResolvedAt;
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
