import { sql } from 'drizzle-orm';
import type { ProductCatalogFilterInput } from '@/api/product-search-input';
import { db } from './index';
import { productSearchFilters } from './product-search-filters';
import { planProductRead } from './product-search-scope';
import { chooseTextForm } from './product-search-text-filter';

/** Results up to this many are counted exactly; beyond it the planner's estimate is returned. */
export const EXACT_TOTAL_LIMIT = 10_000;
/**
 * A sequential read is counted only when the planner expects at least this many matches: the
 * count then stops within about EXACT_TOTAL_LIMIT × 849,000 / 100,000 ≈ 85,000 rows. Sparser
 * matches would walk the whole table before the count stopped, so they get the estimate.
 */
const BROAD_MATCH_ROWS = 100_000;

/**
 * The size of a stored search. The planner's plan comes first (plain EXPLAIN). When an index
 * finds the matches, or they are dense enough that a sequential read finds the bound quickly, a
 * bounded count stops after EXACT_TOTAL_LIMIT + 1 matches, so a narrow search is exact. Past the
 * bound, or when only a long sequential read could count, the total is the planner's row estimate
 * (`totalIsEstimate: true`), from column statistics: an order of magnitude, not a count.
 */
export const countStoredProducts = async (input: ProductCatalogFilterInput, now = new Date()) => {
    const { where } = productSearchFilters(input, now, await chooseTextForm(input));
    const plan = await planProductRead(where);
    if (plan.scansTable && plan.rows < BROAD_MATCH_ROWS) {
        return { total: plan.rows, totalIsEstimate: true };
    }
    const [bounded] = await db.execute<{ total: number }>(sql`
        select count(*)::int total from (
            select 1 from products where ${where ?? sql`true`} limit ${EXACT_TOTAL_LIMIT + 1}
        ) bounded`);
    if ((bounded?.total ?? 0) <= EXACT_TOTAL_LIMIT) {
        return { total: bounded?.total ?? 0, totalIsEstimate: false };
    }
    // The bounded count already proved more than the limit; never report fewer.
    return { total: Math.max(plan.rows, EXACT_TOTAL_LIMIT + 1), totalIsEstimate: true };
};
