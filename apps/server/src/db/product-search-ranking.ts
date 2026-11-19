import { type SQL, sql } from 'drizzle-orm';
import type { StoredProductSearchInput } from '@/api/product-search-input';
import { db } from './index';
import { products } from './product-schema';
import { MERCH_ROOT_CATEGORY_ID } from './sales-curve-observations';

/** The fitted rank-to-sales curve's parameters (see readSalesCurve). */
export interface SalesCurveParameters {
    readonly referenceBsr: number;
    readonly intercept: number;
    readonly headSlope: number;
    readonly tailSlope: number;
}

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

/**
 * The curve's median monthly sales at the Product's current rank, or its 30-day average rank
 * without one: `exp(intercept + slope · ln(bsr / referenceBsr))` with `headSlope` above the
 * reference rank and `tailSlope` below it, rounded and at least 1, as estimateMonthlySales
 * computes it. The current rank leads because a seasonal seller's 30-day average lags its surge
 * by an order of magnitude. Null without a rank or a curve, and outside Clothing, the only root
 * category the curve is fitted on. The curve's parameters are bound, so the estimate sorts and
 * pages in the database.
 */
export const estimatedMonthlySalesColumn = (
    curve: SalesCurveParameters | null
): SQL<number | null> => {
    if (!curve) return sql<number | null>`null::integer`;
    const rank = sql`coalesce(${column('rootCategoryBsr')}, ${column('keepaBsrAverage30')})::float8`;
    const reference = sql`${curve.referenceBsr}::float8`;
    const slope = sql`(case when ${rank} < ${reference} then ${curve.headSlope}::float8 else ${curve.tailSlope}::float8 end)`;
    // The exponent is capped so an extreme fit cannot overflow exp(); real fits stay far below.
    const exponent = sql`least(${MAX_EXPONENT}::float8, ${curve.intercept}::float8 + ${slope} * ln(${rank} / ${reference}))`;
    // floor(x + 0.5) rounds halves up like Math.round; Postgres round() on float8 rounds to even.
    return sql<number | null>`(case when ${rank} > 0
            and ${column('rootCategoryId')} = ${MERCH_ROOT_CATEGORY_ID}
        then greatest(1, floor(exp(${exponent}) + 0.5))::integer end)`;
};

/**
 * The `estimatedMonthlySalesDesc` sort value: the larger of the curve estimate and Amazon's
 * bought-in-past-month badge, so a badge-less seller with a strong rank still ranks by its rank
 * and a badge outranks a curve that undersells it. Null when neither exists.
 */
export const monthlySalesSortColumn = (estimate: SQL<number | null>): SQL<number | null> =>
    sql<number | null>`greatest(${estimate}, ${column('keepaMonthlySold')})`;

/**
 * Amazon's last observed top-20 search position (1–20) of the Product for exactly this term:
 * its position in the newest head (first page) Keepa search run stored for the term, or null
 * when that run did not return it, the term was never searched, or there is no term. Positions
 * are observed on the US marketplace only.
 */
export const keywordPositionColumn = (
    input: Pick<StoredProductSearchInput, 'term' | 'marketplaceId'>
): SQL<number | null> => {
    if (!input.term || input.marketplaceId !== US_MARKETPLACE_ID) {
        return sql<number | null>`null::integer`;
    }
    return sql<number | null>`(
        select res.source_position from catalog_search_results res
        where res.product_id = ${column('id')} and res.run_id = (
            ${headRuns(input.term)} order by run.created_at desc, run.id desc limit 1
        )
        order by res.source_position limit 1
    )`;
};

/**
 * Whether a Keepa head search of exactly this term has ever been stored: without one, the term's
 * Products may simply not be collected yet.
 */
export const hasKeywordHeadRun = async (term: string) => {
    const [row] = await db.execute<{ found: boolean }>(
        sql`select exists (${headRuns(term)}) found`
    );
    return row?.found === true;
};

/**
 * The stored form of a search term: Keepa searches are stored under the trimmed, single-spaced,
 * lower-cased term.
 */
export const normalizeKeywordTerm = (term: string) =>
    term.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The `relevance` sort value: placement tiers above text rank. A placed Product scores
 * PLACEMENT_TIERS - position, an unplaced one 0, plus the title's text rank in [0, 1), so the
 * best placement comes first, unplaced Products last, and text rank orders within a tier.
 */
export const relevanceColumn = (position: SQL<number | null>, textRank: SQL<number>): SQL<number> =>
    sql<number>`(coalesce(${PLACEMENT_TIERS} - ${position}, 0) + ${textRank})::float8`;

const headRuns = (term: string) => sql`
    select run.id from catalog_search_runs run
    join catalog_queries query on query.id = run.query_id
    where query.source = 'keepa' and query.marketplace_id = ${US_MARKETPLACE_ID}
        and query.normalized_term = ${normalizeKeywordTerm(term)} and run.page = 0`;

const MAX_EXPONENT = 50;
/** Above any stored search position, so every placement scores positive. */
const PLACEMENT_TIERS = 1000;

// Qualified by hand: Drizzle renders bare column names in a single-table select, which the
// subqueries here would bind to their own tables.
const column = (
    name: 'id' | 'keepaBsrAverage30' | 'rootCategoryBsr' | 'rootCategoryId' | 'keepaMonthlySold'
) =>
    sql`${products}.${sql.identifier(products[name].name)}`;
