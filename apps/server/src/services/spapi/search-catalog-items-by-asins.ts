import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import type { SpApiProduct } from '@/types';
import { mapSpApiCatalogItem } from './catalog-product-mapper';
import { classifyCatalogItems } from './classify-catalog-items';
import { ItemSearchResultsSchema } from './search-catalog-items-schema';

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

    const response = ItemSearchResultsSchema.parse(
        await spApiProvider.searchCatalogItemsByAsins({
            asins,
            marketplaceId,
            priority: options.priority,
        })
    );
    const classified = await classifyCatalogItems({
        items: response.items.filter(item => asins.includes(item.asin)),
        marketplaceId,
        priority: options.priority,
        provider: spApiProvider,
    });
    const fetchedAt = new Date().toISOString();
    const byAsin = new Map(
        classified.map(({ item, merch }) => [
            item.asin,
            mapSpApiCatalogItem(item, marketplaceId, fetchedAt, merch),
        ])
    );

    return asins.flatMap(asin => byAsin.get(asin) ?? []);
};
