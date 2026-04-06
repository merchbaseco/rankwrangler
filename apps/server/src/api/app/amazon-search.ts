import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import {
    type CatalogKeywordSearchItem,
    searchCatalogItemsByKeyword,
} from '@/services/spapi/search-catalog-items-by-keyword.js';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue.js';

const amazonSearchInput = z.object({
    keyword: z
        .string()
        .trim()
        .min(1, 'Keyword is required')
        .max(200, 'Keyword must be 200 characters or fewer')
        .transform(value => value.replace(/\s+/g, ' ')),
});

export const amazonSearch = appProcedure
    .input(amazonSearchInput)
    .query(async ({ input }) => {
        const result = await searchCatalogItemsByKeyword({
            marketplaceId: SPAPI_US_MARKETPLACE_ID,
            keyword: input.keyword,
            pageSize: 20,
        });

        void enqueueAmazonSearchSyncQueueItems({
            items: result.items,
        });

        return result;
    });

export const enqueueAmazonSearchSyncQueueItems = async ({
    items,
    enqueue = enqueueSpApiSyncQueueItems,
    logError = console.error,
}: {
    items: CatalogKeywordSearchItem[];
    enqueue?: (
        queueItems: Array<{ marketplaceId: string; asin: string }>
    ) => Promise<number>;
    logError?: typeof console.error;
}) => {
    const queueItems = buildAmazonSearchSyncQueueItems(items);
    if (queueItems.length === 0) {
        return 0;
    }

    try {
        return await enqueue(queueItems);
    } catch (error) {
        logError(
            '[api.app.amazon.search] Failed to enqueue keyword results for sync:',
            error
        );
        return 0;
    }
};

export const buildAmazonSearchSyncQueueItems = (
    items: CatalogKeywordSearchItem[]
) => {
    const seen = new Set<string>();
    const queueItems: Array<{ marketplaceId: string; asin: string }> = [];

    for (const item of items) {
        const asin = item.asin.trim().toUpperCase();
        if (!asin || !item.marketplaceId) {
            continue;
        }

        const key = `${item.marketplaceId}:${asin}`;
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        queueItems.push({
            marketplaceId: item.marketplaceId,
            asin,
        });
    }

    return queueItems;
};
