import { and, eq, inArray } from 'drizzle-orm';
import type { db } from '@/db/index';
import { familyIdentityKey, resolveFamilyIdentities } from '@/db/product/product-family';
import { upsertProductsInfo } from '@/db/product/upsert-product';
import { products as productTable } from '@/db/product-schema';
import {
    createSpApiProvider,
    type SpApiProvider,
} from '@/services/providers/sp-api/sp-api-provider';
import { mapSpApiCatalogItem } from '@/services/spapi/catalog-product-mapper';
import { ItemSearchResultsSchema } from '@/services/spapi/search-catalog-items-schema';
import type { SpApiProduct } from '@/types';
import type { DiscoveryScope } from './discovery-types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const asinPattern = /^[A-Z0-9]{10}$/i;

export const discoverSpApiKeyword = async (
    input: {
        scope: DiscoveryScope;
        pageToken?: string;
        marketplaceId: string;
        workId: string;
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

/**
 * Stores a scanned page's Merch and unknown Products. A Product classified non-Merch is stored only
 * when it already exists, so keyword scans keep known rows current without filling the catalog with
 * other sellers' listings. Counts and the page fingerprint still cover every result on the page.
 */
export const persistDiscoveredSpApiProducts = async (
    transaction: Transaction,
    products: SpApiProduct[]
) => {
    if (!products.length) {
        return {
            pageAsins: [],
            productIds: [],
            merchProductIds: [],
            newProductIds: [],
            newMerchProductIds: [],
            unknownCount: 0,
            nonMerchCount: 0,
        };
    }
    const marketplaceId = products[0].marketplaceId;
    const pageAsins = [...new Set(products.map(product => product.asin))];
    const families = await resolveFamilyIdentities(
        transaction,
        pageAsins.map(asin => ({ marketplaceId, asin }))
    );
    const familyAsin = (product: SpApiProduct) =>
        product.parentAsin ??
        families.get(familyIdentityKey({ marketplaceId, asin: product.asin }))?.asin ??
        product.asin;
    const existingAsins = new Set(
        (
            await transaction
                .select({ asin: productTable.asin })
                .from(productTable)
                .where(
                    productIdentities(marketplaceId, [
                        ...new Set([...pageAsins, ...products.map(familyAsin)]),
                    ])
                )
        ).map(row => row.asin)
    );
    const stored = products.filter(
        product =>
            product.isMerchListing !== false ||
            existingAsins.has(product.asin) ||
            existingAsins.has(familyAsin(product))
    );
    const storedAsins = new Set(stored.map(product => product.asin));
    const skippedNonMerchCount = pageAsins.filter(asin => !storedAsins.has(asin)).length;
    const identities = await upsertProductsInfo(stored, transaction);
    const newProductIds = [
        ...new Set(identities.filter(identity => identity.inserted).map(identity => identity.id)),
    ];
    // Keep provider page order: keyword standing stores the head in search-rank order. Variants of
    // one family on the same page count once, at the family's best position.
    const order = new Map(products.map((product, index) => [product.asin, index]));
    const position = new Map<string, number>();
    for (const identity of identities) {
        const index = order.get(identity.sourceAsin) ?? 0;
        position.set(identity.id, Math.min(position.get(identity.id) ?? index, index));
    }
    const rows = (
        position.size
            ? await transaction
                  .select({ id: productTable.id, isMerchListing: productTable.isMerchListing })
                  .from(productTable)
                  .where(inArray(productTable.id, [...position.keys()]))
            : []
    ).sort((left, right) => (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0));
    return {
        pageAsins,
        newProductIds,
        newMerchProductIds: rows
            .filter(row => row.isMerchListing === true && newProductIds.includes(row.id))
            .map(row => row.id),
        unknownCount: rows.filter(row => row.isMerchListing === null).length,
        nonMerchCount:
            rows.filter(row => row.isMerchListing === false).length + skippedNonMerchCount,
        productIds: rows.map(row => row.id),
        merchProductIds: rows.filter(row => row.isMerchListing === true).map(row => row.id),
    };
};

const productIdentities = (marketplaceId: string, asins: string[]) =>
    and(eq(productTable.marketplaceId, marketplaceId), inArray(productTable.asin, asins));
