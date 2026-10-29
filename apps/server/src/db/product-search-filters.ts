import { and, eq, gte, inArray, isNull, lte, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { ProductCatalogFilterInput, ProductSearchInput } from '@/api/product-search-input';
import { officialBrands } from './official-brand-schema';
import { products } from './product-schema';
import { productGridPredicates, productHasNiche } from './product-search-grid';
import { productSearchUpdatedAt } from './product-search-sort';
import { productSearchTextFilter } from './product-search-text-filter';

/**
 * The stored search's WHERE clause. `base` is every filter except Explore's sidebar groups, which
 * come back separately in `grid` so the facet aggregate can count each group without its own
 * filter; `where` is all of them.
 */
export const productSearchFilters = (input: ProductCatalogFilterInput, now = new Date()) => {
    const text = productSearchTextFilter(input);
    const conditions: Array<SQL | undefined> = [text.where];
    if (input.marketplaceIds.length) {
        conditions.push(inArray(products.marketplaceId, input.marketplaceIds));
    }
    if (input.isMerchListing === 'unknown') {
        conditions.push(isNull(products.isMerchListing));
    } else if (input.isMerchListing !== 'all') {
        conditions.push(eq(products.isMerchListing, input.isMerchListing));
    }
    if (input.amazonListingStatus !== 'all') {
        conditions.push(eq(products.amazonListingStatus, input.amazonListingStatus));
    }
    if (input.brands.length) {
        conditions.push(
            sql`${normalizedBrand(products.brand)} in (${sql.join(
                input.brands.map(brand => normalizedBrand(sql`${brand}`)),
                sql`, `
            )})`
        );
    }
    if (input.excludeBrands.length) {
        conditions.push(
            sql`(${products.brand} is null or ${normalizedBrand(products.brand)} not in (${sql.join(
                input.excludeBrands.map(brand => normalizedBrand(sql`${brand}`)),
                sql`, `
            )}))`
        );
    }
    if (!input.includeOfficialBrands) {
        conditions.push(sql`not exists (
        select 1 from ${officialBrands} where ${officialBrands.marketplaceId} = ${products.marketplaceId}
            and ${officialBrands.normalizedBrand} = ${normalizedBrand(products.brand)}
    )`);
    }
    if (input.categoryIds.length) {
        conditions.push(inArray(products.rootCategoryId, input.categoryIds));
    }
    conditions.push(
        ...numericConditions(products.rootCategoryBsr, input.salesRank),
        ...numericConditions(products.keepaCurrentNewPrice, input.price),
        ...numericConditions(products.keepaMonthlySold, input.monthlySold),
        ...dateConditions(products.dateFirstAvailable, input.firstAvailableAt),
        ...dateConditions(products.createdAt, input.discoveredAt),
        ...dateConditions(productSearchUpdatedAt, input.updatedAt)
    );
    if (input.facets.length) {
        conditions.push(sql`exists (
        select 1 from product_facets pf join product_facet_values pfv on pfv.id = pf.facet_value_id
        where pf.product_id = ${products.id} and (${sql.join(
            input.facets.map(
                value => sql`(pfv.facet = ${value.facet} and pfv.name = ${value.name})`
            ),
            sql` or `
        )})
    )`);
    }
    const grid = productGridPredicates(
        input,
        {
            bsr: products.rootCategoryBsr,
            firstAvailableAt: products.dateFirstAvailable,
            // Qualified by hand: a single-table select renders a bare `"id"`.
            hasNiche: productHasNiche(sql`${products}.${sql.identifier(products.id.name)}`),
        },
        now
    );
    const base = and(...conditions) ?? sql`true`;
    return {
        base,
        grid,
        where: and(base, grid.tier, grid.published, grid.niche),
        relevance: text.relevance,
    };
};

const normalizedBrand = (column: SQLWrapper) =>
    sql`lower(btrim(regexp_replace(${column}, '[[:space:]]+', ' ', 'g')))`;

const numericConditions = (column: SQLWrapper, range: ProductSearchInput['salesRank']) => [
    range?.min === undefined ? undefined : gte(sql`${column}`, range.min),
    range?.max === undefined ? undefined : lte(sql`${column}`, range.max),
];

const dateConditions = (column: SQLWrapper, range: ProductSearchInput['updatedAt']) => [
    range?.after ? sql`${column} >= ${range.after}::timestamp` : undefined,
    range?.before ? sql`${column} <= ${range.before}::timestamp` : undefined,
];
