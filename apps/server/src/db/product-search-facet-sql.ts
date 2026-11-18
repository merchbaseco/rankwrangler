import { type SQL, sql } from 'drizzle-orm';
import type { ProductSearchFacetsInput } from '@/api/product-search-input';
import { bsrHistogramBuckets, bsrTierKeys } from '@/services/bsr-tiers';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { lastKeepaMinuteAt } from '@/services/keepa-history-series';
import { products } from './product-schema';
import {
    bsrTierCondition,
    PUBLISHED_RECENT_DAYS,
    productGridPredicates,
    utcDayStart,
} from './product-search-grid';
import { type ProductScope, samplePercent, scopeSource } from './product-search-scope';

/** Products sampled (uniformly, by random UUID order) for the seven-day improvement share. */
export const IMPROVING_SAMPLE_SIZE = 2_000;
const DAY_MS = 86_400_000;
/** Latest points read first for the improvement share; a week of rank changes rarely exceeds it. */
const SERIES_TAIL = 256;
/**
 * Lower bounds of the monthly-sold histogram on Amazon's "bought in past month" badge steps (50,
 * hundreds below 1K, then thousands), so a badge never straddles two buckets. The first bucket
 * holds the 50+ badge; the last is open-ended.
 */
export const SOLD_BUCKET_FLOORS = [
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000, 2_000, 3_000, 4_000, 5_000, 10_000,
    20_000, 50_000,
] as const;

/**
 * The facet statement: `matched` holds the scope's Products under every non-sidebar filter
 * (`base`), carrying rank, monthly sold, first-available date and niche; the outer aggregate
 * counts each sidebar group under the other groups' filters with FILTER clauses; the improvement
 * share samples the first IMPROVING_SAMPLE_SIZE matches of every filter in UUID order from the
 * same rows. `limit` caps `matched` (the `all` scope's guard). Also returns how many rows
 * `matched` holds and the share of pages read, to scale a sample's counts.
 */
export const productFacetStatement = ({
    base,
    input,
    limit,
    now,
    scope,
}: {
    base: SQL | undefined;
    input: ProductSearchFacetsInput;
    limit: SQL;
    now: Date;
    scope: ProductScope;
}) => {
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
    const days = facetDays(now);
    const yearStart = utcDayStart(now, 364).toISOString();
    const count = (name: string, condition: SQL) =>
        sql`count(*) filter (where ${condition})::int ${sql.identifier(name)}`;
    return sql`
        with matched as materialized (
            select ${products.id} id, ${products.rootCategoryBsr} bsr,
                ${products.keepaMonthlySold} sold, ${products.dateFirstAvailable} first_available,
                ${products.hasNiche} has_niche
            from ${scopeSource(scope)} where ${base ?? sql`true`} ${limit}
        ),
        improvement as (${improvementShare(all, now)})
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
            ${sql.join(
                SOLD_BUCKET_FLOORS.map((floor, index) => {
                    const next = SOLD_BUCKET_FLOORS[index + 1];
                    return count(
                        `sold_${index}`,
                        sql`${all} and sold >= ${sql.raw(String(floor))}${
                            next === undefined ? sql`` : sql` and sold < ${sql.raw(String(next))}`
                        }`
                    );
                }),
                sql`, `
            )},
            round(percentile_cont(0.5) within group (order by bsr)
                filter (where ${all} and bsr >= 1))::int median_bsr,
            round(percentile_cont(0.5) within group (order by sold)
                filter (where ${all} and sold is not null))::int median_sold,
            count(*)::int matched_rows,
            ${scope === 'sample' ? sql`(${samplePercent})` : sql`100::float8`} sample_percent,
            (select improved from improvement) improved,
            (select compared from improvement) compared
        from matched`;
};

/** The 60 UTC days of the published-per-day band, oldest first. */
export const facetDays = (now: Date) =>
    Array.from({ length: PUBLISHED_RECENT_DAYS }, (_, index) =>
        utcDayStart(now, PUBLISHED_RECENT_DAYS - 1 - index)
    );

/**
 * Of the first IMPROVING_SAMPLE_SIZE matches in UUID order (uniform, since ids are random), how
 * many compare and how many improved: the main BSR in force now against the one in force seven
 * days ago. Series are sorted, so only the tail matters: when its first point is at or before a
 * week ago, the whole answer is inside it, and only longer weeks scan the full series.
 * max(array[minute, value]) picks the latest point at or before each instant in one pass.
 */
const improvementShare = (all: SQL, now: Date) => {
    const current = lastKeepaMinuteAt(now);
    const weekAgo = lastKeepaMinuteAt(new Date(now.getTime() - 7 * DAY_MS));
    const metric = keepaHistoryMetricColumns.bsrMain;
    return sql`
        select count(*) filter (where history.current_value < history.previous_value)::int improved,
            count(*)::int compared
        from (
            select id from matched where ${all} order by id limit ${IMPROVING_SAMPLE_SIZE}
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
        where history.current_value >= 0 and history.previous_value >= 0`;
};
