import type { Product, ProductIdentifier } from '../types/product';
import { db } from './index';

const CACHE_DURATION_MS = 1000 * 60 * 60; // 1 hour

const get = async (productIdentifier: ProductIdentifier): Promise<Product | undefined> => {
    const cached = await db.cachedProducts.get([
        productIdentifier.asin,
        productIdentifier.marketplaceId,
    ]);

    if (!cached) return undefined;

    const isExpired = new Date(cached.expiresAt) < new Date();
    if (isExpired) {
        await db.cachedProducts.delete([productIdentifier.asin, productIdentifier.marketplaceId]);
        return undefined;
    }

    return cached.product as Product;
};

const set = async (product: Product): Promise<void> => {
    await db.cachedProducts.put({
        asin: product.asin,
        marketplaceId: product.marketplaceId,
        product,
        expiresAt: new Date(Date.now() + CACHE_DURATION_MS),
    });
};

const clearExpired = async (): Promise<void> => {
    const now = new Date().toISOString();
    await db.cachedProducts.where('expiresAt').below(now).delete();
};

const getCacheSize = async (): Promise<number> => {
    return await db.cachedProducts.count();
};

const clearCache = async (): Promise<void> => {
    await db.cachedProducts.clear();
};

export const ProductCache = {
    get,
    set,
    clearExpired,
    getCacheSize,
    clearCache,
};
