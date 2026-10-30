import { TRPCError } from '@trpc/server';
import {
    ensureProductIdentities,
    getStoredProducts,
    markProductsDeleted,
    type ProductIdentity,
    type StoredProductRead,
} from '@/db/product/get-products';
import { db } from '@/db/index';
import { familyIdentityKey, resolveFamilyIdentities } from '@/db/product/product-family';
import { mapStoredProductInfo } from '@/db/product/product-info-mapper';
import { upsertProductInfo } from '@/db/product/upsert-product';
import { deleteSpApiSyncQueueItemsForIdentities } from '@/db/spapi-sync-queue/delete-queue-items';
import { searchCatalogItemsByAsins } from '@/services/spapi/search-catalog-items-by-asins';
import type { ProductInfo, SpApiProduct } from '@/types';
import { PRODUCT_DEFAULT_MAX_AGE_MS } from './product-freshness-policy';
import {
    getAmazonListingStatus,
    hasKnownListing,
    shouldResolve,
} from './product-retrieval-state';
import {
    enqueueBackgroundProducts,
    resolveProduct,
    resolveProducts,
} from './product-retrieval-work';
import { enqueueSpApiSyncQueueItems } from './spapi-sync-queue';

/**
 * blocking: wait for every stale or unknown Product.
 * background: never wait; queue refreshes.
 * last-known: serve any Product with a known listing at once and refresh it in the background;
 * wait only for Products with no known listing.
 */
export type ProductFetchPolicy = 'blocking' | 'background' | 'last-known';
export type AmazonListingResolutionStatus = 'pending' | 'active' | 'deleted';

export interface ProductRetrieval {
    identity: ProductIdentity;
    product: ProductInfo | null;
    amazonListingStatus: AmazonListingResolutionStatus;
}

export interface PersistProductSyncResultsInput {
    identities: ProductIdentity[];
    products: SpApiProduct[];
    resolvedAt: Date;
}

interface PersistProductSyncResultsDeps {
    ensureProductIdentities: typeof ensureProductIdentities;
    upsertProductInfo: typeof upsertProductInfo;
    markProductsDeleted: typeof markProductsDeleted;
}

const defaultPersistProductSyncResultsDeps: PersistProductSyncResultsDeps = {
    ensureProductIdentities,
    upsertProductInfo,
    markProductsDeleted,
};

export const persistProductSyncResults = async (
    { identities, products, resolvedAt }: PersistProductSyncResultsInput,
    deps = defaultPersistProductSyncResultsDeps
) => {
    await deps.ensureProductIdentities(identities);
    const fetchedIdentities = new Set(products.map(product => productKey(product)));
    for (const product of products) {
        await deps.upsertProductInfo(product);
    }

    const deletedIdentities = identities.filter(
        identity => !fetchedIdentities.has(productKey(identity))
    );
    await deps.markProductsDeleted(deletedIdentities, resolvedAt);
};

export interface ProductRetrievalDeps {
    getStoredProducts: typeof getStoredProducts;
    ensureProductIdentities: typeof ensureProductIdentities;
    enqueueSpApiSyncQueueItems: typeof enqueueSpApiSyncQueueItems;
    searchCatalogItemsByAsins: typeof searchCatalogItemsByAsins;
    persistProductSyncResults: typeof persistProductSyncResults;
    deleteSpApiSyncQueueItemsForIdentities?: typeof deleteSpApiSyncQueueItemsForIdentities;
    resolveFamilies?: (identities: ProductIdentity[]) => Promise<Map<string, ProductIdentity>>;
}

const defaultDeps: ProductRetrievalDeps = {
    getStoredProducts,
    ensureProductIdentities,
    enqueueSpApiSyncQueueItems,
    searchCatalogItemsByAsins,
    persistProductSyncResults,
    deleteSpApiSyncQueueItemsForIdentities,
    resolveFamilies: identities => resolveFamilyIdentities(db, identities),
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
    const requested = normalizeIdentities(requestedProducts);
    if (requested.length === 0) {
        return [];
    }
    // A variant ASIN reads and refreshes its family; nothing is fetched for the variant itself.
    let families = await resolveFamilies(deps, requested);
    const identities = familiesOf(requested, families);

    const cutoff = new Date(Date.now() - Math.max(0, maxAgeMs));
    let stored = await deps.getStoredProducts(identities);
    const storedByKey = indexStoredProducts(stored);
    const needsResolution = identities.filter(identity =>
        shouldResolve(storedByKey.get(productKey(identity)), cutoff, rediscoveredAt)
    );

    if (fetchPolicy === 'blocking') {
        await resolveProducts(needsResolution, deps, signal, timeoutMs);
        if (needsResolution.length > 0) {
            families = await resolveFamilies(deps, requested);
            stored = await deps.getStoredProducts(familiesOf(requested, families));
        }
    } else if (fetchPolicy === 'last-known') {
        const known = needsResolution.filter(identity =>
            hasKnownListing(storedByKey.get(productKey(identity)))
        );
        const unknown = needsResolution.filter(
            identity => !hasKnownListing(storedByKey.get(productKey(identity)))
        );
        if (known.length > 0) {
            enqueueBackgroundProducts(known, storedByKey, deps).catch(error => {
                console.error('[Product Retrieval] Background refresh enqueue failed:', error);
            });
        }
        await resolveProducts(unknown, deps, signal, timeoutMs);
        if (unknown.length > 0) {
            families = await resolveFamilies(deps, requested);
            stored = await deps.getStoredProducts(familiesOf(requested, families));
        }
    } else if (needsResolution.length > 0) {
        await enqueueBackgroundProducts(needsResolution, storedByKey, deps);
        stored = await deps.getStoredProducts(identities);
    }

    const finalByKey = indexStoredProducts(stored);
    return requested.map(identity =>
        mapProductRetrieval(identity, finalByKey.get(productKey(familyOf(identity, families))))
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
    const [requested] = normalizeIdentities([{ marketplaceId, asin }]);
    const identity = familyOf(requested, await resolveFamilies(deps, [requested]));
    const [stored] = await deps.getStoredProducts([identity]);
    const result = mapProductRetrieval(requested, stored);
    const cutoff = new Date(Date.now() - Math.max(0, maxAgeMs));

    if (!(refresh || shouldResolve(stored, cutoff))) {
        return result;
    }

    if (result.amazonListingStatus === 'active' && !refresh) {
        enqueueBackgroundProducts(
            [identity],
            indexStoredProducts(stored ? [stored] : []),
            deps
        ).catch(() => undefined);
        return result;
    }

    await resolveProduct(identity, deps, signal, timeoutMs);
    const family = familyOf(requested, await resolveFamilies(deps, [requested]));
    const [refreshed] = await deps.getStoredProducts([family]);
    return mapProductRetrieval(requested, refreshed);
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

    if (!result || result.amazonListingStatus !== 'active' || !result.product) {
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
        amazonListingStatus: getAmazonListingStatus(stored),
    };
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

// Without a resolver (unit tests) every ASIN is its own family.
const resolveFamilies = async (deps: ProductRetrievalDeps, identities: ProductIdentity[]) =>
    deps.resolveFamilies ? await deps.resolveFamilies(identities) : new Map<string, ProductIdentity>();

const familyOf = (identity: ProductIdentity, families: Map<string, ProductIdentity>) =>
    families.get(familyIdentityKey(identity)) ?? identity;

const familiesOf = (identities: ProductIdentity[], families: Map<string, ProductIdentity>) =>
    normalizeIdentities(identities.map(identity => familyOf(identity, families)));
