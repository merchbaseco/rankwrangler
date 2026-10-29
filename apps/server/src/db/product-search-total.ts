import { type SQL, sql } from 'drizzle-orm';
import type { ProductCatalogFilterInput } from '@/api/product-search-input';
import { db } from './index';
import { productSearchFilters } from './product-search-filters';

/** Results up to this many are counted exactly; beyond it the planner's estimate is returned. */
export const EXACT_TOTAL_LIMIT = 10_000;

/**
 * The size of a stored search. A bounded count stops after EXACT_TOTAL_LIMIT + 1 matches, so a
 * narrow search is exact and a broad one never walks millions of rows; past the bound the total
 * is the planner's row estimate for the same WHERE clause (`totalIsEstimate: true`). The estimate
 * comes from column statistics, so it is an order of magnitude, not a count.
 */
export const countStoredProducts = async (input: ProductCatalogFilterInput, now = new Date()) => {
    const { where } = productSearchFilters(input, now);
    const [bounded] = await db.execute<{ total: number }>(sql`
        select count(*)::int total from (
            select 1 from products where ${where ?? sql`true`} limit ${EXACT_TOTAL_LIMIT + 1}
        ) bounded`);
    if ((bounded?.total ?? 0) <= EXACT_TOTAL_LIMIT) {
        return { total: bounded?.total ?? 0, totalIsEstimate: false };
    }
    return { total: await estimateRows(where ?? sql`true`), totalIsEstimate: true };
};

const estimateRows = async (where: SQL) => {
    const [plan] = await db.execute<{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': number } }] }>(
        sql`explain (format json) select 1 from products where ${where}`
    );
    const rows = Math.round(plan?.['QUERY PLAN']?.[0]?.Plan?.['Plan Rows'] ?? 0);
    // The bounded count already proved more than the limit; never report fewer.
    return Math.max(rows, EXACT_TOTAL_LIMIT + 1);
};
