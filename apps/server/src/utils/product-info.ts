import { TRPCError } from '@trpc/server';
import { db } from '@/db/index.js';
import { getProductInfoFromStore } from '@/db/product/get-product.js';
import { productIngestQueue } from '@/db/schema.js';
import { trackApiRequest } from '@/services/posthog.js';

export type ProductInfoRequest = {
    marketplaceId: string;
    asin: string;
    uid: string;
    endpoint: string;
};

export const fetchProductInfo = async ({
    marketplaceId,
    asin,
    uid,
    endpoint,
}: ProductInfoRequest) => {
    try {
        const cachedProduct = await getProductInfoFromStore(marketplaceId, asin);
        if (cachedProduct) {
            trackApiRequest({
                uid,
                endpoint,
                marketplaceId,
                asin,
                cached: true,
            });

            return cachedProduct;
        }

        trackApiRequest({
            uid,
            endpoint,
            marketplaceId,
            asin,
            cached: false,
        });

        await db.insert(productIngestQueue).values({ marketplaceId, asin }).onConflictDoNothing();

        const maxAttempts = 50;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 200));

            const polledProduct = await getProductInfoFromStore(marketplaceId, asin);
            if (polledProduct) {
                return polledProduct;
            }
        }

        throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Request timeout: product info not available after 10 seconds',
        });
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
