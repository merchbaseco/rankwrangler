import { type SQL, sql } from 'drizzle-orm';
import type { ProductSearchFacetsInput } from '@/api/product-search-input';
import { type BsrTier, bsrHistogramBuckets, bsrTierKeys } from '@/services/bsr-tiers';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { lastKeepaMinuteAt } from '@/services/keepa-history-series';
import { db } from './index';
import { products } from './product-schema';
import { productSearchFilters } from './product-search-filters';
import {
    bsrTierCondition,
    PUBLISHED_RECENT_DAYS,
    productGridPredicates,
    utcDayStart,
} from './product-search-grid';

/** Products sampled (uniformly, by random UUID order) for the seven-day improvement share. */
export const IMPROVING_SAMPLE_SIZE = 2_000;
const DAY_MS = 86_400_000;
/** Latest points read first for the improvement share; a week of rank changes rarely exceeds it. */
const SERIES_TAIL = 256;

/**
 * Explore's sidebar counts and KPI bands in one scan of the Products matching every non-sidebar
 * filter. Each sidebar group is counted under the other groups' filters but not its own (faceted
 * exclusion), and every KPI aggregate sees all filters. A second bounded read, run alongside,
 * samples history for the seven-day improvement share. Counts are exact; see
 * docs/internals/product-catalog.md.
 */
export const readProductSearchFacets = async (
    input: ProductSearchFacetsInput,
    now = new Date()
) => {
    const { base } = productSearchFilters(input, now);
    const grid = productGridPredicates(
        input,
        {
            bsr: sql.identifier('bsr'),
            firstAvailableAt: sql.identifier('first_available'),
            hasNiche: sql.identifier('has_niche'),
        },
        now
    );
    const all = sql`(${grid.tier} and ${grid.published} and ${grid.niche})`;
    const days = Array.from({ length: PUBLISHED_RECENT_DAYS }, (_, index) =>
        utcDayStart(now, PUBLISHED_RECENT_DAYS - 1 - index)
    );
    const yearStart = utcDayStart(now, 364).toISOString();
    const count = (name: string, condition: SQL) =>
        sql`count(*) filter (where ${condition})::int ${sql.identifier(name)}`;
    // The improvement sample is independent of the aggregate, so both reads run at once.
    const [[row], improving] = await Promise.all([
        db.execute<Record<string, number | null>>(sql`
        select
            ${count('total', all)},
            ${sql.join(
                bsrTierKeys.map(tier =>
                    count(
                        `tier_${tier}`,
                        sql`${grid.published} and ${grid.niche} and ${bsrTierCondition(sql.identifier('bsr'), tier)}`
                    )
                ),
                sql`, `
            )},
            ${count('published_last60d', sql`${grid.tier} and ${grid.niche} and first_available >= ${days[0].toISOString()}::timestamp`)},
            ${count('published_last_year', sql`${grid.tier} and ${grid.niche} and first_available >= ${yearStart}::timestamp`)},
            ${count('published_any', sql`${grid.tier} and ${grid.niche}`)},
            ${count('niche_has', sql`${grid.tier} and ${grid.published} and has_niche`)},
            ${count('niche_none', sql`${grid.tier} and ${grid.published} and not has_niche`)},
            ${sql.join(
                bsrHistogramBuckets.map((bucket, index) =>
                    count(
                        `bucket_${index}`,
                        sql`${all} and bsr > ${sql.raw(String(bucket.min))}${
                            bucket.open
                                ? sql``
                                : sql` and bsr <= ${sql.raw(String(bucket.bucketMax))}`
                        }`
                    )
                ),
                sql`, `
            )},
            ${sql.join(
                days.map((day, index) =>
                    count(
                        `day_${index}`,
                        sql`${all} and first_available >= ${day.toISOString()}::timestamp
                            and first_available < ${day.toISOString()}::timestamp + interval '1 day'`
                    )
                ),
                sql`, `
            )},
            round(percentile_cont(0.5) within group (order by bsr)
                filter (where ${all} and bsr >= 1))::int median_bsr,
            round(percentile_cont(0.5) within group (order by sold)
                filter (where ${all} and sold is not null))::int median_sold
        from (
            select ${products.rootCategoryBsr} bsr, ${products.keepaMonthlySold} sold,
                ${products.dateFirstAvailable} first_available,
                exists (select 1 from product_facets pf where pf.product_id = ${products.id}) has_niche
            from ${products} where ${base}
        ) matched`),
        readImprovingShare(input, now),
    ]);
    const value = (name: string) => Number(row?.[name] ?? 0);
    const total = value('total');
    const publishedPerDay60d = days.map((day, index) => ({
        day: day.toISOString().slice(0, 10),
        count: value(`day_${index}`),
    }));
    const recent = publishedPerDay60d.reduce((sum, day) => sum + day.count, 0);
    return {
        total,
        totalIsEstimate: false,
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
        improving7dShare: total ? improving : null,
        medianSoldPerMonth: row?.median_sold ?? null,
        publishedPerDay60d,
        publishedPerDayAvg: total ? recent / PUBLISHED_RECENT_DAYS : null,
    };
};

/**
 * Share of sampled results whose main BSR in force now is better (lower) than the one in force
 * seven days ago, from stored history. The sample is the first IMPROVING_SAMPLE_SIZE matches in
 * UUID order, which is uniform because Product ids are random; Products without a point on both
 * sides are left out. Null when no sampled Product has comparable history.
 */
const readImprovingShare = async (input: ProductSearchFacetsInput, now: Date) => {
    const { where } = productSearchFilters(input, now);
    const current = lastKeepaMinuteAt(now);
    const weekAgo = lastKeepaMinuteAt(new Date(now.getTime() - 7 * DAY_MS));
    const metric = keepaHistoryMetricColumns.bsrMain;
    // Series are sorted, so only the tail matters: when its first point is at or before a week
    // ago, the whole answer is inside it, and only longer weeks scan the full series.
    // max(array[minute, value]) then picks the latest point at or before each instant in one pass.
    const [row] = await db.execute<{ improved: number; compared: number }>(sql`
        select count(*) filter (where history.current_value < history.previous_value)::int improved,
            count(*)::int compared
        from (
            select ${products.id} id from ${products}
            where ${where} order by ${products.id} limit ${IMPROVING_SAMPLE_SIZE}
        ) sample
        cross join lateral (
            select (max(array[h.m, h.v]) filter (where h.m <= ${current}))[2] current_value,
                (max(array[h.m, h.v]) filter (where h.m <= ${weekAgo}))[2] previous_value
            from product_history_series s
            cross join lateral (
                select greatest(cardinality(s.keepa_minutes) - ${SERIES_TAIL - 1}, 1) as tail_start
            ) tail
            cross join lateral unnest(
                case when s.keepa_minutes[tail.tail_start] <= ${weekAgo}
                    then s.keepa_minutes[tail.tail_start:] else s.keepa_minutes end,
                case when s.keepa_minutes[tail.tail_start] <= ${weekAgo}
                    then s.keepa_values[tail.tail_start:] else s.keepa_values end
            ) h(m, v)
            where s.product_id = sample.id and s.source = 'keepa' and s.metric = ${metric}
                and h.m <= ${current}
        ) history
        where history.current_value >= 0 and history.previous_value >= 0`);
    return row?.compared ? row.improved / row.compared : null;
};
