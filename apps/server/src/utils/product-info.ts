import { TRPCError } from '@trpc/server';
import { getProductInfoFromStore } from '@/db/product/get-product.js';
import { upsertProductInfo } from '@/db/product/upsert-product.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';

export type ProductInfoRequest = {
    marketplaceId: string;
    asin: string;
    maxAgeMs?: number;
};

type ProductInfoResult = NonNullable<Awaited<ReturnType<typeof getProductInfoFromStore>>>;

const productInfoFetchInFlight = new Map<string, Promise<ProductInfoResult>>();

export const fetchProductInfo = async ({
    marketplaceId,
    asin,
    maxAgeMs,
}: ProductInfoRequest) => {
    try {
        const cachedProduct = await getProductInfoFromStore(marketplaceId, asin, maxAgeMs);
        if (cachedProduct) {
            return cachedProduct;
        }

        const inFlightKey = `${marketplaceId}:${asin}`;
        const inFlightFetch = productInfoFetchInFlight.get(inFlightKey);
        if (inFlightFetch) {
            return await inFlightFetch;
        }

        const fetchPromise = fetchFreshProductInfo({ marketplaceId, asin, maxAgeMs }).finally(() => {
            productInfoFetchInFlight.delete(inFlightKey);
        });
        productInfoFetchInFlight.set(inFlightKey, fetchPromise);

        return await fetchPromise;
    } catch (error) {
        if (error instanceof TRPCError) {
            throw error;
        }

        console.error(`[${new Date().toISOString()}] Error getting product info:`, error);
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
};

const fetchFreshProductInfo = async ({
    marketplaceId,
    asin,
    maxAgeMs,
}: ProductInfoRequest): Promise<ProductInfoResult> => {
    try {
        const [freshProduct] = await searchCatalogItemsByAsins(marketplaceId, [asin]);
        if (!freshProduct) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Product info not available from Amazon catalog.',
            });
        }

        await upsertProductInfo(freshProduct);
        const storedProduct = await getProductInfoFromStore(marketplaceId, asin, maxAgeMs);
        if (!storedProduct) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Product info fetched but was not available from the product store.',
            });
        }

        return storedProduct;
    } catch (error) {
        if (error instanceof TRPCError) {
            throw error;
        }

        console.error(`[${new Date().toISOString()}] Error getting product info:`, error);
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
};
