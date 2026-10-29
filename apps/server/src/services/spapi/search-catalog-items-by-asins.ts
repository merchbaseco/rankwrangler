import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import type { SpApiProduct } from '@/types';
import { mapSpApiCatalogItem } from './catalog-product-mapper';
import { ItemSchema, ItemSearchResultsSchema } from './search-catalog-items-schema';

const spApiProvider = createSpApiProvider();

// Get product info using searchCatalogItems API (supports single or multiple ASINs)
export const searchCatalogItemsByAsins = async (
    marketplaceId: string,
    asins: string[],
    options: { priority?: 'foreground' | 'background' } = {}
): Promise<SpApiProduct[]> => {
    if (!marketplaceId || typeof marketplaceId !== 'string') {
        throw new Error('Marketplace ID is required');
    }

    if (asins.length === 0) {
        throw new Error('ASINs are required');
    }

    const rawResponse = await spApiProvider.searchCatalogItemsByAsins({
        asins,
        marketplaceId,
        priority: options.priority,
    });

    // Validate response and parse items
    const results: SpApiProduct[] = [];
    // Validate response with Zod schema
    const response = ItemSearchResultsSchema.parse(rawResponse);
    const items = response.items;

    for (const rawItem of items) {
        // Validate each item with Zod schema
        const item = ItemSchema.parse(rawItem);
        const asin = item.asin;

        if (!asins.includes(asin)) {
            continue;
        }

        const productInfo = mapSpApiCatalogItem(item, marketplaceId, new Date().toISOString());
        results.push(productInfo);
    }

    const orderedResults = asins
        .map(asin => results.find(item => item.asin === asin))
        .filter((item): item is SpApiProduct => Boolean(item));

    return orderedResults ?? [];
};
