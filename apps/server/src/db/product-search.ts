import { and, sql } from 'drizzle-orm';
import type { ProductSearchInput } from '@/api/product-search-input';
import { db } from './index';
import { getMarketplaceCurrencyCode } from './product/marketplace-currency';
import { products } from './product-schema';
import { productSearchFilters } from './product-search-filters';
import { productSearchSort, productSearchUpdatedAt } from './product-search-sort';

export const searchStoredProducts = async (input: ProductSearchInput) => {
    const filters = productSearchFilters(input);
    const sort = productSearchSort(input, filters.relevance);
    const rows = await db
        .select({
            id: products.id,
            sortValue: sort.value,
            marketplaceId: products.marketplaceId,
            asin: products.asin,
            title: products.title,
            brand: products.brand,
            bullet1: products.bullet1,
            bullet2: products.bullet2,
            thumbnailUrl: products.thumbnailUrl,
            isMerchListing: products.isMerchListing,
            amazonListingStatus: products.amazonListingStatus,
            categoryId: products.rootCategoryId,
            salesRank: products.rootCategoryBsr,
            priceMinor: products.keepaCurrentNewPrice,
            firstAvailableAt: products.dateFirstAvailable,
            discoveredAt: products.createdAt,
            updatedAt: productSearchUpdatedAt,
            average30: products.keepaBsrAverage30,
            average90: products.keepaBsrAverage90,
            monthlySold: products.keepaMonthlySold,
            drops30: products.keepaSalesRankDrops30,
            drops90: products.keepaSalesRankDrops90,
            drops180: products.keepaSalesRankDrops180,
            drops365: products.keepaSalesRankDrops365,
            facets: sql<Array<{ facet: string; name: string }>>`coalesce((
            select jsonb_agg(jsonb_build_object('facet', pfv.facet, 'name', pfv.name) order by pfv.facet, pfv.name)
            from product_facets pf join product_facet_values pfv on pfv.id = pf.facet_value_id
            where pf.product_id = ${products.id}
        ), '[]'::jsonb)`,
        })
        .from(products)
        .where(and(filters.where, sort.after))
        .orderBy(...sort.order)
        .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
        items: page.map(row => ({
            marketplaceId: row.marketplaceId,
            asin: row.asin,
            title: row.title,
            brand: row.brand,
            bullet1: row.bullet1,
            bullet2: row.bullet2,
            thumbnail: row.thumbnailUrl
                ? { status: 'available' as const, url: row.thumbnailUrl }
                : { status: 'unavailable' as const },
            isMerchListing: row.isMerchListing,
            amazonListingStatus: row.amazonListingStatus,
            categoryId: row.categoryId,
            salesRank: row.salesRank,
            price:
                row.priceMinor !== null && getMarketplaceCurrencyCode(row.marketplaceId)
                    ? {
                          amountMinor: row.priceMinor,
                          currencyCode: getMarketplaceCurrencyCode(row.marketplaceId),
                      }
                    : null,
            firstAvailableAt: row.firstAvailableAt?.toISOString() ?? null,
            discoveredAt: row.discoveredAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            averages: { last30Days: row.average30, last90Days: row.average90 },
            demand: {
                boughtInPastMonth: row.monthlySold,
                salesRankDrops: {
                    last30Days: row.drops30,
                    last90Days: row.drops90,
                    last180Days: row.drops180,
                    last365Days: row.drops365,
                },
            },
            facets: row.facets,
        })),
        nextCursor: rows.length > input.limit && last ? sort.encode(last) : null,
    };
};
