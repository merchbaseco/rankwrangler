import { type SQLWrapper, sql } from 'drizzle-orm';

/**
 * A brand's comparison key: lower case, trimmed, inner whitespace runs collapsed to one space. The
 * `products_marketplace_brand_key_idx` expression index is built from this exact expression, so a
 * read that compares `productBrandKey(products.brand)` is an index read; `official_brands` stores
 * its brands already in this form.
 */
export const productBrandKey = (column: SQLWrapper) =>
    sql`lower(btrim(regexp_replace(${column}, '[[:space:]]+', ' ', 'g')))`;
