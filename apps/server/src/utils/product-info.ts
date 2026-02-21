import { TRPCError } from '@trpc/server';
import { getProductInfoFromStore } from '@/db/product/get-product.js';
import { enqueueKeepaHistoryRefreshForAsin } from '@/services/keepa-history-refresh.js';
import { trackApiRequest } from '@/services/posthog.js';
import { enqueueSpApiSyncQueueItem } from '@/services/spapi-sync-queue.js';

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
            await tryEnqueueKeepaHistoryRefresh({
                marketplaceId,
                asin,
            });

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

        await enqueueSpApiSyncQueueItem({ marketplaceId, asin });

        const maxAttempts = 50;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 200));

            const polledProduct = await getProductInfoFromStore(marketplaceId, asin);
            if (polledProduct) {
                await tryEnqueueKeepaHistoryRefresh({
                    marketplaceId,
                    asin,
                });

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

const tryEnqueueKeepaHistoryRefresh = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    try {
        await enqueueKeepaHistoryRefreshForAsin({ marketplaceId, asin });
    } catch (error) {
        console.error(
            `[Keepa Queue] Failed to enqueue ASIN ${asin} (${marketplaceId}):`,
            error
        );
    }
};
