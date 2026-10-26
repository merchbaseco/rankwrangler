import type { DiscoveryScope } from './discovery-types';
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
        scope: DiscoveryScope;
        pageToken?: string;
        marketplaceId: string;
        workId?: string;
    },
    provider: Pick<SpApiProvider, 'searchCatalogItemsByKeyword'> = createSpApiProvider()
) => {
    const response = ItemSearchResultsSchema.parse(
        await provider.searchCatalogItemsByKeyword({
            keyword: input.scope.term,
            ...(input.scope.kind === 'brand' ? { brandNames: [input.scope.brandName] } : {}),
            attemptId: input.workId,
            marketplaceId: input.marketplaceId,
            pageSize: 20,
            maxAttempts: 1,
            priority: 'background',
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
    const newProductIds: string[] = [];
    for (const product of [...products].sort((left, right) =>
        left.asin.localeCompare(right.asin)
    )) {
        const identity = await upsertProductInfo(product, transaction);
        if (identity.inserted) newProductIds.push(identity.id);
    }
    if (!products.length) {
        return {
            productIds: [],
            merchProductIds: [],
            newProductIds: [],
            newMerchProductIds: [],
            unknownCount: 0,
            nonMerchCount: 0,
        };
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
        newProductIds,
        newMerchProductIds: rows
            .filter(row => row.isMerchListing === true && newProductIds.includes(row.id))
            .map(row => row.id),
        unknownCount: rows.filter(row => row.isMerchListing === null).length,
        nonMerchCount: rows.filter(row => row.isMerchListing === false).length,
        productIds: rows.map(row => row.id),
        merchProductIds: rows.filter(row => row.isMerchListing === true).map(row => row.id),
    };
};
