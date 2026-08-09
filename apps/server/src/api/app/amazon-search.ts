import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import {
    searchCatalogItemsByKeyword,
} from '@/services/spapi/search-catalog-items-by-keyword.js';
import { getProducts, type ProductRetrieval } from '@/services/product-retrieval';
import type { CatalogKeywordSearchItem } from '@/services/spapi/search-catalog-items-by-keyword.js';

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

        await retrieveAmazonSearchProducts(result.items);

        return result;
    });

export const retrieveAmazonSearchProducts = async (
    items: CatalogKeywordSearchItem[],
    retrieve: typeof getProducts = getProducts
): Promise<ProductRetrieval[]> => {
    return await retrieve({
        products: items.map(item => ({
            marketplaceId: item.marketplaceId,
            asin: item.asin,
        })),
        fetchPolicy: 'background',
        rediscoveredAt: getLatestObservationTime(items),
    });
};

const getLatestObservationTime = (items: CatalogKeywordSearchItem[]) => {
    const latest = items.reduce<Date | null>((current, item) => {
        const observedAt = new Date(item.fetchedAt);
        return !current || observedAt > current ? observedAt : current;
    }, null);
    return latest ?? undefined;
};
