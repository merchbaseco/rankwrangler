import type { Product } from '../content/types/product';

const BSR_CACHE_KEY = 'bsrCache';

/**
 * Returns the number of products in the local extension cache.
 */
export const getCacheSize = async () => {
    const result = await chrome.storage.local.get([BSR_CACHE_KEY]);
    return Object.keys(result[BSR_CACHE_KEY] || {}).length;
};

/**
 * Sets the cached product for the given ASIN.
 */
export const setCachedProduct = async (product: Product) => {
    const result = await chrome.storage.local.get([BSR_CACHE_KEY]);
    const cache = result[BSR_CACHE_KEY] || {};

    const newCache = {
        [product.asin]: {
            product,
            cachedAt: Date.now(),
        },
        ...cache,
    };

    await chrome.storage.local.set({ [BSR_CACHE_KEY]: newCache });
};

/**
 * Returns the cached product for the given ASIN, or undefined if not found.
 */
export const getCachedProduct = async (asin: string): Promise<Product | undefined> => {
    const result = await chrome.storage.local.get([BSR_CACHE_KEY]);
    const cache = result[BSR_CACHE_KEY] || {};

    return cache[asin] ? cache[asin].product : undefined;
};

/**
 * Clears out the product cache.
 */
export const clearCache = async () => {
    await chrome.storage.local.remove([BSR_CACHE_KEY]);
};
