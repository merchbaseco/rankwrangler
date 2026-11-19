import { and, type SQL, sql } from 'drizzle-orm';
import { readSalesCurve } from '@/services/sales-curve';
import type { StoredProductSearchInput } from '@/api/product-search-input';
import { db } from './index';
import { getMarketplaceCurrencyCode } from './product/marketplace-currency';
import { products } from './product-schema';
import { productSearchFilters } from './product-search-filters';
import {
    InvalidProductSearchCursorError,
    productSearchSort,
    productSearchUpdatedAt,
} from './product-search-sort';
import {
    estimatedMonthlySalesColumn,
    keywordPositionColumn,
    monthlySalesSortColumn,
    relevanceColumn,
    type SalesCurveParameters,
} from './product-search-ranking';
import { chooseTextForm } from './product-search-text-filter';

/**
 * A caller-specific column selected for each returned Product in the same statement, from the
 * Product's qualified columns (a single-table select renders them bare).
 */
export type ProductExtraColumn<T> = (product: { id: SQL; marketplaceId: SQL; asin: SQL }) => SQL<T>;

/** Offset paging skips at most this many rows; deeper pages continue with the cursor. */
export const MAX_SEARCH_OFFSET = 10_000;

/**
 * One page of stored Products. `page` reads by offset, skipping at most MAX_SEARCH_OFFSET rows,
 * and ignores the cursor; otherwise keyset paging continues from `cursor`. Either way
 * `nextCursor` continues after the returned page. A term with more estimated matches than
 * TEXT_LOOKUP_LIMIT is matched per row (see ProductTextForm), and its relevance order is sales
 * rank, since ranking means scoring every match. `curve` is the rank-to-sales fit the estimates
 * use; omitted, the server's current fit for the marketplace is read.
 */
export const searchStoredProducts = async <Extra = never>(
    input: StoredProductSearchInput,
    {
        now = new Date(),
        extra,
        curve,
    }: {
        now?: Date;
        extra?: ProductExtraColumn<Extra>;
        curve?: SalesCurveParameters | null;
    } = {}
) => {
    const size = input.pageSize ?? input.limit;
    const offset = input.page ? (input.page - 1) * size : 0;
    if (offset > MAX_SEARCH_OFFSET) {
        throw new InvalidProductSearchCursorError(
            `Pages reach ${MAX_SEARCH_OFFSET.toLocaleString('en-US')} rows deep; narrow the search or continue with the cursor.`
        );
    }
    const [textForm, fit] = await Promise.all([
        chooseTextForm(input),
        curve === undefined ? readSalesCurve(input.marketplaceId).then(read => read.curve) : curve,
    ]);
    const filters = productSearchFilters(input, now, textForm);
    const position = keywordPositionColumn(input);
    const estimate = estimatedMonthlySalesColumn(fit);
    const sorted = textForm === 'row' && input.sort === 'relevance' ? 'salesRankAsc' : input.sort;
    const sort = productSearchSort(
        { ...input, sort: sorted, ...(input.page ? { cursor: null } : {}) },
        {
            relevance: relevanceColumn(position, filters.relevance),
            monthlySales: monthlySalesSortColumn(estimate),
        }
    );
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
            imageUrl: products.thumbnailUrl,
            isMerchListing: products.isMerchListing,
            amazonListingStatus: products.amazonListingStatus,
            categoryId: products.rootCategoryId,
            salesRank: products.rootCategoryBsr,
            average30: products.keepaBsrAverage30,
            average90: products.keepaBsrAverage90,
            drops30: products.keepaSalesRankDrops30,
            drops90: products.keepaSalesRankDrops90,
            drops180: products.keepaSalesRankDrops180,
            drops365: products.keepaSalesRankDrops365,
            boughtInPastMonth: products.keepaMonthlySold,
            estimatedMonthlySales: estimate,
            keywordPosition: position,
            priceMinor: products.keepaCurrentNewPrice,
            firstAvailableAt: products.dateFirstAvailable,
            discoveredAt: products.createdAt,
            updatedAt: productSearchUpdatedAt,
            // Qualified by hand: Drizzle renders a bare `"id"` in a single-table select, which
            // this subquery would bind to `pfv.id`.
            facets: sql<Array<{ facet: string; name: string }>>`coalesce((
            select jsonb_agg(jsonb_build_object('facet', pfv.facet, 'name', pfv.name) order by pfv.facet, pfv.name)
            from product_facets pf join product_facet_values pfv on pfv.id = pf.facet_value_id
            where pf.product_id = ${products}.${sql.identifier(products.id.name)}
        ), '[]'::jsonb)`,
            extra: extra ? extra(qualifiedColumns) : sql<null>`null`,
        })
        .from(products)
        .where(and(filters.where, sort.after))
        .orderBy(...sort.order)
        .limit(size + 1)
        .offset(offset);
    const page = rows.slice(0, size);
    const last = page.at(-1);
    return {
        items: page.map(row => {
            const currencyCode = getMarketplaceCurrencyCode(row.marketplaceId);
            const item = {
                marketplaceId: row.marketplaceId,
                asin: row.asin,
                title: row.title,
                brand: row.brand,
                bullet1: row.bullet1,
                bullet2: row.bullet2,
                imageUrl: row.imageUrl,
                isMerchListing: row.isMerchListing,
                amazonListingStatus: row.amazonListingStatus,
                categoryId: row.categoryId,
                salesRank: row.salesRank,
                salesRankAverages: { last30Days: row.average30, last90Days: row.average90 },
                salesRankDrops: {
                    last30Days: row.drops30,
                    last90Days: row.drops90,
                    last180Days: row.drops180,
                    last365Days: row.drops365,
                },
                boughtInPastMonth: row.boughtInPastMonth,
                estimatedMonthlySales: row.estimatedMonthlySales,
                keywordPosition: row.keywordPosition,
                price:
                    row.priceMinor !== null && currencyCode
                        ? { amountMinor: row.priceMinor, currencyCode }
                        : null,
                firstAvailableAt: row.firstAvailableAt?.toISOString() ?? null,
                discoveredAt: row.discoveredAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
                facets: row.facets,
            };
            return (extra ? { ...item, extra: row.extra } : item) as SearchItem<typeof item, Extra>;
        }),
        nextCursor: rows.length > size && last ? sort.encode(last) : null,
    };
};

// The caller's extra column is typed only when one was asked for, so the public search's items
// carry no `extra` key at all.
type SearchItem<Item, Extra> = [Extra] extends [never] ? Item : Item & { extra: Extra };

const qualifiedColumns = {
    id: sql`${products}.${sql.identifier(products.id.name)}`,
    marketplaceId: sql`${products}.${sql.identifier(products.marketplaceId.name)}`,
    asin: sql`${products}.${sql.identifier(products.asin.name)}`,
};
