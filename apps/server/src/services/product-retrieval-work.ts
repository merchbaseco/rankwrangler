import type { ProductIdentity, StoredProductRead } from '@/db/product/get-products';
import { SpApiBackoffError } from '@/services/spapi/spapi-backoff';
import type { SpApiProduct } from '@/types';
import type { ProductRetrievalDeps } from './product-retrieval';
import {
    coordinateRetrieval,
    isRetrievalInFlight,
    RetrievalRetryableError,
} from './retrieval-coordinator';

export type ProductDetailWorkDeps = {
    ensureProductIdentities?: ProductRetrievalDeps['ensureProductIdentities'];
    searchCatalogItemsByAsins: ProductRetrievalDeps['searchCatalogItemsByAsins'];
    persistProductSyncResults: ProductRetrievalDeps['persistProductSyncResults'];
    deleteSpApiSyncQueueItemsForIdentities?: ProductRetrievalDeps['deleteSpApiSyncQueueItemsForIdentities'];
};

export type ProductDetailWorkResult = {
    products: SpApiProduct[];
};

const inFlightProductBatches = new Map<string, Promise<ProductDetailWorkResult>>();

export const resolveProduct = async (
    identity: ProductIdentity,
    deps: ProductRetrievalDeps,
    signal?: AbortSignal,
    timeoutMs?: number
) => {
    await resolveProductDetails([identity], deps, signal, timeoutMs);
    await deps.deleteSpApiSyncQueueItemsForIdentities?.([identity]);
};

export const resolveProductDetails = async (
    identities: ProductIdentity[],
    deps: ProductDetailWorkDeps,
    signal?: AbortSignal,
    timeoutMs?: number
): Promise<ProductDetailWorkResult> => {
    const uniqueIdentities = uniqueProductIdentities(identities);
    startMissingProductBatches(uniqueIdentities, deps);

    const results = await Promise.all(
        uniqueIdentities.map(identity =>
            coordinateRetrieval({
                key: retrievalKey(identity),
                signal,
                timeoutMs,
                retryMessage: 'Product refresh is temporarily unavailable. Retry shortly.',
                work: () => getProductBatch(identity),
            })
        )
    );

    return {
        products: uniqueProducts(results.flatMap(result => result.products)),
    };
};

export const enqueueBackgroundProducts = async (
    identities: ProductIdentity[],
    storedByKey: Map<string, StoredProductRead>,
    deps: ProductRetrievalDeps
) => {
    const queueItems = identities.filter(
        identity => !storedByKey.get(productKey(identity))?.queuePending
    );
    if (queueItems.length === 0) {
        return;
    }

    await coordinateRetrieval({
        key: `product-queue:${queueItems.map(productKey).sort().join(',')}`,
        work: async () => {
            const missing = queueItems.filter(identity => !storedByKey.has(productKey(identity)));
            await deps.ensureProductIdentities(missing);
            await deps.enqueueSpApiSyncQueueItems(queueItems);
        },
    });
};

const startMissingProductBatches = (
    identities: ProductIdentity[],
    deps: ProductDetailWorkDeps
) => {
    const missingByMarketplace = new Map<string, ProductIdentity[]>();
    for (const identity of identities) {
        const key = productKey(identity);
        if (
            inFlightProductBatches.has(key) ||
            isRetrievalInFlight(retrievalKey(identity))
        ) {
            continue;
        }

        const marketplaceIdentities = missingByMarketplace.get(identity.marketplaceId) ?? [];
        marketplaceIdentities.push(identity);
        missingByMarketplace.set(identity.marketplaceId, marketplaceIdentities);
    }

    for (const marketplaceIdentities of missingByMarketplace.values()) {
        const batchPromise = runProductBatch(marketplaceIdentities, deps);
        for (const identity of marketplaceIdentities) {
            inFlightProductBatches.set(productKey(identity), batchPromise);
        }

        const clearBatch = () => {
            for (const identity of marketplaceIdentities) {
                const key = productKey(identity);
                if (inFlightProductBatches.get(key) === batchPromise) {
                    inFlightProductBatches.delete(key);
                }
            }
        };
        void batchPromise.then(clearBatch, clearBatch);
    }
};

const runProductBatch = async (
    identities: ProductIdentity[],
    deps: ProductDetailWorkDeps
): Promise<ProductDetailWorkResult> => {
    try {
        await deps.ensureProductIdentities?.(identities);
        const products = await deps.searchCatalogItemsByAsins(
            identities[0]?.marketplaceId ?? '',
            identities.map(identity => identity.asin)
        );
        await deps.persistProductSyncResults({
            identities,
            products,
            resolvedAt: new Date(),
        });
        await deps.deleteSpApiSyncQueueItemsForIdentities?.(identities);
        return { products };
    } catch (error) {
        if (error instanceof SpApiBackoffError && error.retryable) {
            throw new RetrievalRetryableError(
                'Product refresh is temporarily unavailable. Retry shortly.',
                { reason: 'capacity' }
            );
        }
        throw error;
    }
};

const getProductBatch = async (identity: ProductIdentity) => {
    const batch = inFlightProductBatches.get(productKey(identity));
    if (!batch) {
        throw new Error(`Missing in-flight Product batch for ${productKey(identity)}.`);
    }
    return await batch;
};

const uniqueProductIdentities = (identities: ProductIdentity[]) => {
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

const uniqueProducts = (products: SpApiProduct[]) => {
    const unique = new Map<string, SpApiProduct>();
    for (const product of products) {
        unique.set(productKey(product), product);
    }
    return Array.from(unique.values());
};

const retrievalKey = (identity: ProductIdentity) => `product:${productKey(identity)}`;

const productKey = (identity: Pick<ProductIdentity, 'marketplaceId' | 'asin'>) =>
    `${identity.marketplaceId}:${identity.asin}`;
