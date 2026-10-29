import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { ProductCatalogFilterInput } from '@/api/product-search-input';
import { type BsrTier, bsrTierKeys, bsrTierRange } from '@/services/bsr-tiers';

const DAY_MS = 86_400_000;
export const PUBLISHED_RECENT_DAYS = 60;
export const PUBLISHED_YEAR_DAYS = 365;

/**
 * Explore's sidebar predicates, written over caller-supplied columns so the search can apply them
 * to `products` and the facet aggregate can re-evaluate them per row inside one scan. Each returns
 * `true` when its filter is unset.
 */
export const productGridPredicates = (
    input: Pick<ProductCatalogFilterInput, 'tiers' | 'published' | 'niche'>,
    columns: Readonly<{ bsr: SQLWrapper; firstAvailableAt: SQLWrapper; hasNiche: SQLWrapper }>,
    now: Date
) => {
    const tiers = input.tiers ?? [];
    const published = input.published ?? 'any';
    const niche = input.niche ?? 'any';
    return {
        tier:
            tiers.length && tiers.length < bsrTierKeys.length
                ? sql`(${sql.join(
                      tiers.map(tier => bsrTierCondition(columns.bsr, tier)),
                      sql` or `
                  )})`
                : sql`true`,
        published:
            published === 'any'
                ? sql`true`
                : sql`${columns.firstAvailableAt} >= ${publishedWindowStart(published, now)}::timestamp`,
        niche:
            niche === 'any'
                ? sql`true`
                : niche === 'has'
                  ? sql`${columns.hasNiche}`
                  : sql`not ${columns.hasNiche}`,
    } satisfies Record<string, SQL>;
};

/** Inclusive tier range; `slow` also holds unranked Products, matching the website. */
export const bsrTierCondition = (bsr: SQLWrapper, tier: BsrTier) => {
    const { min, max } = bsrTierRange(tier);
    return max === null
        ? sql`(${bsr} is null or ${bsr} < 1 or ${bsr} >= ${sql.raw(String(min))})`
        : sql`(${bsr} >= ${sql.raw(String(min))} and ${bsr} <= ${sql.raw(String(max))})`;
};

/** Whether a Product carries any semantic facet (its niche); unclassified Products do not. */
export const productHasNiche = (productId: SQLWrapper) =>
    sql`exists (select 1 from product_facets pf where pf.product_id = ${productId})`;

/** Start of the UTC calendar day `days - 1` days before `now`: a window of `days` days. */
export const utcDayStart = (now: Date, daysBack: number) => {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    return new Date(day.getTime() - daysBack * DAY_MS);
};

const publishedWindowStart = (published: 'last60d' | 'lastYear', now: Date) =>
    utcDayStart(
        now,
        (published === 'last60d' ? PUBLISHED_RECENT_DAYS : PUBLISHED_YEAR_DAYS) - 1
    ).toISOString();
