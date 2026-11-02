import { sql } from 'drizzle-orm';
import type { ProductSearchFacetsInput } from '@/api/product-search-input';
import {
    KEEPA_MAIN_CATEGORY_ID,
    keepaHistoryMetricColumns,
} from '@/services/keepa-history-metrics';
import { dateToKeepaMinute, lastKeepaMinuteAt } from '@/services/keepa-history-series';
import { readSalesCurve } from '@/services/sales-curve';
import { curveMedianSales } from '@/services/sales-curve-fit';
import { bucketSeasonality, seasonalityStart } from '@/services/search-seasonality';
import { db } from './index';
import { products } from './product-schema';
import { productSearchFilters } from './product-search-filters';

/** Designs sampled (uniformly, by random UUID order) for Explore's seasonality chart. */
export const SEASONALITY_SAMPLE_SIZE = 1_000;
/** Keepa minutes a UTC day; Keepa minute 0 is a UTC midnight (2011-01-01). */
const DAY_MINUTES = 1_440;
/** The curve gives median units a month; a week is 7 of a month's average 30.4375 days. */
const WEEKS_PER_MONTH = 365.25 / 12 / 7;

/**
 * Explore's seasonality: estimated units sold a week over the last 52 weeks, from the main BSR
 * history of a uniform sample of the designs matching
 * every Explore filter. The sample is the first SEASONALITY_SAMPLE_SIZE matches in UUID order, as
 * for the improvement share. Ranks become sales through the current rank-to-sales curve, so the
 * figures are orders of magnitude, not counts. Null while no curve is fitted or no sampled design
 * has history in the window. See docs/internals/product-catalog.md.
 */
export const readProductSearchSeasonality = async (
    input: ProductSearchFacetsInput,
    now = new Date()
) => {
    const { curve } = await readSalesCurve();
    if (!curve) return null;
    const series = await readSampledBsrSeries(input, now);
    return bucketSeasonality(series, bsr => curveMedianSales(curve, bsr) / WEEKS_PER_MONTH, now);
};

/**
 * The sampled designs' main BSR series, thinned in the database. Weeks end at UTC midnight, so a
 * point matters only when a day boundary falls before the next point; the rest are superseded
 * before any week's end. Points outside the window are dropped except the one in force at its
 * start. That leaves at most one point a day per design.
 */
const readSampledBsrSeries = async (input: ProductSearchFacetsInput, now: Date) => {
    const { where } = productSearchFilters(input, now);
    const start = dateToKeepaMinute(seasonalityStart(now));
    const end = lastKeepaMinuteAt(now);
    const day = sql.raw(String(DAY_MINUTES));
    const rows = await db.execute<{ minutes: number[]; vals: number[] }>(sql`
        select array_agg(h.m order by h.ord) minutes, array_agg(h.v order by h.ord) vals
        from (
            select ${products.id} id from ${products}
            where ${where} order by ${products.id} limit ${SEASONALITY_SAMPLE_SIZE}
        ) sample
        join product_history_series s on s.product_id = sample.id and s.source = 'keepa'
            and s.metric = ${keepaHistoryMetricColumns.bsrMain}
            and s.category_id = ${KEEPA_MAIN_CATEGORY_ID}
        cross join lateral (
            select h.m, h.v, h.ord, lead(h.m) over (order by h.ord) next_m
            from unnest(s.keepa_minutes, s.keepa_values) with ordinality h(m, v, ord)
        ) h
        where h.m <= ${end}
            and (h.next_m is null or (h.next_m > ${start} and h.next_m / ${day} > h.m / ${day}))
        group by s.product_id`);
    return rows.map(row => ({ keepaMinutes: row.minutes, values: row.vals }));
};
