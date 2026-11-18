import { type SQL, sql } from 'drizzle-orm';
import type { ProductSearchFacetsInput } from '@/api/product-search-input';
import { type BsrTier, bsrHistogramBuckets, bsrTierKeys } from '@/services/bsr-tiers';
import { db } from './index';
import { facetDays, productFacetStatement, SOLD_BUCKET_FLOORS } from './product-search-facet-sql';
import { productSearchFilters } from './product-search-filters';
import { PUBLISHED_RECENT_DAYS } from './product-search-grid';
import {
    chooseProductScope,
    EXACT_SCOPE_ROWS,
    type ProductScope,
    scopeFilters,
    scopeLimit,
} from './product-search-scope';

export { IMPROVING_SAMPLE_SIZE } from './product-search-facet-sql';

export type ProductSearchFacets = Awaited<ReturnType<typeof readProductSearchFacets>>;

/**
 * Explore's sidebar counts and KPI bands in one statement over the Products matching every
 * non-sidebar filter. Each sidebar group is counted under the other groups' filters but not its
 * own (faceted exclusion), and every KPI aggregate sees all filters; the seven-day improvement
 * share samples the same rows. The read is bounded (see ProductScope): counts are exact when an
 * index finds the matches, and otherwise scaled from a block sample with `totalIsEstimate: true`.
 * `exhaustive` counts every match whatever it costs, for the background default-view snapshot.
 * See docs/internals/product-catalog.md.
 */
export const readProductSearchFacets = async (
    input: ProductSearchFacetsInput,
    now = new Date(),
    { exhaustive = false }: { exhaustive?: boolean } = {}
) => {
    if (exhaustive) {
        return (await readFacets(input, now, 'all', sql``, productSearchFilters(input, now).base))
            .facets;
    }
    const scope = await chooseProductScope(input, now, 'base');
    const base = scopeFilters(input, now, scope).base;
    const read = await readFacets(input, now, scope, scopeLimit(scope), base);
    // The planner expected few matches but the guard was reached: count from a sample instead.
    if (scope === 'all' && read.matchedRows > EXACT_SCOPE_ROWS) {
        const sample = scopeFilters(input, now, 'sample').base;
        return (await readFacets(input, now, 'sample', sql``, sample)).facets;
    }
    return read.facets;
};

const readFacets = async (
    input: ProductSearchFacetsInput,
    now: Date,
    scope: ProductScope,
    limit: SQL,
    base: SQL | undefined
) => {
    const [row] = await db.execute<Record<string, number | null>>(
        productFacetStatement({ base, input, limit, now, scope })
    );
    const percent = Number(row?.sample_percent ?? 100);
    const scale = percent > 0 && percent < 100 ? 100 / percent : 1;
    const value = (name: string) => Math.round(Number(row?.[name] ?? 0) * scale);
    const total = value('total');
    const days = facetDays(now);
    const publishedPerDay60d = days.map((day, index) => ({
        day: day.toISOString().slice(0, 10),
        count: value(`day_${index}`),
    }));
    const recent = publishedPerDay60d.reduce((sum, day) => sum + day.count, 0);
    const compared = Number(row?.compared ?? 0);
    const facets = {
        total,
        totalIsEstimate: scale !== 1,
        tiers: Object.fromEntries(bsrTierKeys.map(tier => [tier, value(`tier_${tier}`)])) as Record<
            BsrTier,
            number
        >,
        published: {
            last60d: value('published_last60d'),
            lastYear: value('published_last_year'),
            any: value('published_any'),
        },
        niche: { has: value('niche_has'), none: value('niche_none') },
        bsrHistogram: bsrHistogramBuckets.map((bucket, index) => ({
            bucketMax: bucket.bucketMax,
            count: value(`bucket_${index}`),
            tier: bucket.tier,
        })),
        medianBsr: row?.median_bsr ?? null,
        improving7dShare: total && compared ? Number(row?.improved ?? 0) / compared : null,
        medianSoldPerMonth: row?.median_sold ?? null,
        soldHistogram: SOLD_BUCKET_FLOORS.map((min, index) => ({
            min,
            max: SOLD_BUCKET_FLOORS[index + 1] ?? null,
            count: value(`sold_${index}`),
        })),
        publishedPerDay60d,
        publishedPerDayAvg: total ? recent / PUBLISHED_RECENT_DAYS : null,
    };
    return { facets, matchedRows: Number(row?.matched_rows ?? 0) };
};
