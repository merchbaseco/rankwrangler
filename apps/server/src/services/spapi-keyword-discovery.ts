import { and, eq, inArray } from 'drizzle-orm';
import type { db } from '@/db/index';
import { upsertProductInfo } from '@/db/product/upsert-product';
import { products as productTable } from '@/db/product-schema';
import {
    createSpApiProvider,
    type SpApiProvider,
} from '@/services/providers/sp-api/sp-api-provider';
import { mapSpApiCatalogItem } from '@/services/spapi/catalog-product-mapper';
import { ItemSearchResultsSchema } from '@/services/spapi/search-catalog-items-schema';
import type { SpApiProduct } from '@/types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const asinPattern = /^[A-Z0-9]{10}$/i;

export const discoverSpApiKeyword = async (
    input: {
        term: string;
        pageToken?: string;
        marketplaceId: string;
        workId?: string;
        queryId?: string;
    },
    provider: Pick<SpApiProvider, 'searchCatalogItemsByKeyword'> = createSpApiProvider()
) => {
    const response = ItemSearchResultsSchema.parse(
        await provider.searchCatalogItemsByKeyword({
            keyword: input.term,
            marketplaceId: input.marketplaceId,
            pageSize: 20,
            maxAttempts: 1,
            pageToken: input.pageToken,
        })
    );
    const observedAt = new Date();
    const products: SpApiProduct[] = [];
    const seen = new Set<string>();
    for (const item of response.items) {
        const asin = item.asin.toUpperCase();
        if (!asinPattern.test(asin) || seen.has(asin)) {
            continue;
        }
        seen.add(asin);
        products.push(
            mapSpApiCatalogItem({ ...item, asin }, input.marketplaceId, observedAt.toISOString())
        );
    }
    return { products, nextPageToken: response.pagination?.nextToken ?? null, observedAt };
};

export const persistDiscoveredSpApiProducts = async (
    transaction: Transaction,
    products: SpApiProduct[]
) => {
    for (const product of [...products].sort((left, right) => left.asin.localeCompare(right.asin))) {
        await upsertProductInfo(product, transaction);
    }
    if (!products.length) {
        return { productIds: [], merchProductIds: [] };
    }
    const identities = and(
        eq(productTable.marketplaceId, products[0].marketplaceId),
        inArray(
            productTable.asin,
            products.map(product => product.asin)
        )
    );
    const rows = await transaction
        .select({ id: productTable.id, isMerchListing: productTable.isMerchListing })
        .from(productTable)
        .where(identities);
    return {
        productIds: rows.map(row => row.id),
        merchProductIds: rows.filter(row => row.isMerchListing === true).map(row => row.id),
    };
};
