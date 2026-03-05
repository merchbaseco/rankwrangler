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
            caller: 'api.app.amazon.search',
        });

        const queueItems = buildAmazonSearchSyncQueueItems(result.items);
        if (queueItems.length > 0) {
            try {
                await enqueueSpApiSyncQueueItems(queueItems);
            } catch (error) {
                console.error(
                    '[api.app.amazon.search] Failed to enqueue keyword results for sync:',
                    error
                );
            }
        }

        return result;
    });

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
