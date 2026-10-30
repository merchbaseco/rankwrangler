import { type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { keepaHistoryPointAt, lastKeepaMinuteAt } from '@/services/keepa-history-series';
import { enrichmentKey } from './product-stored-enrichment';

export const SPARKLINE_DAYS = 30;
const DAY_MS = 86_400_000;
const DAY_MINUTES = 1_440;
/** Latest points read first; thirty days of rank changes rarely exceed it. */
const SERIES_TAIL = 256;

/**
 * A Product's main-category BSR points for its thirty-day sparkline, as a jsonb array of
 * `[keepaMinute, value]`, for selecting beside the Product itself. History is a step function, so
 * the points are those inside the window plus the one in force at its start, never the whole
 * series. Series are sorted, so each reads only its tail when the tail already reaches back past
 * the window start, and points superseded before the next daily sample are left out.
 */
export const bsrSparklinePointsColumn = (productId: SQL, now: Date) => {
    const { start, end } = sparklineWindow(now);
    return sql`coalesce((
        select jsonb_agg(jsonb_build_array(h.m, h.v))
        from product_history_series s
        cross join lateral (
            select case when s.keepa_minutes[t.i]<=${start} then s.keepa_minutes[t.i:] else s.keepa_minutes end minutes,
                case when s.keepa_minutes[t.i]<=${start} then s.keepa_values[t.i:] else s.keepa_values end vals
            from (select greatest(cardinality(s.keepa_minutes)-${SERIES_TAIL - 1},1) i) t
        ) w
        cross join lateral (
            select h.m, h.v, lead(h.m) over (order by h.ord) next_m
            from unnest(w.minutes, w.vals) with ordinality h(m,v,ord)
        ) h
        where s.product_id=${productId} and s.source='keepa'
            and s.metric=${keepaHistoryMetricColumns.bsrMain}
            and h.m<=${end} and (h.m>${start} or h.next_m is null or h.next_m>${start})
            and ${sampledPoint(start)}
    ), '[]'::jsonb)`;
};

/**
 * Samples a Product's sparkline points (`bsrSparklinePointsColumn`) once per day: each sample is
 * the value in force at that instant. Samples before the first point, and samples where Keepa
 * recorded no rank, are omitted.
 */
export const sampleBsrSparkline = (
    points: readonly (readonly [number, number])[],
    now: Date
): BsrSparklinePoint[] => {
    const sorted = points
        .map(([keepaMinutes, value]) => ({ keepaMinutes, value }))
        .sort((left, right) => left.keepaMinutes - right.keepaMinutes);
    return sparklineSamples(now).flatMap(({ back, minute }) => {
        const point = keepaHistoryPointAt(sorted, minute);
        if (!point || point.value < 0) return [];
        return [{ at: new Date(now.getTime() - back * DAY_MS).toISOString(), salesRank: point.value }];
    });
};

/** Sparklines for Products by identity; Products without history get none. */
export const readBsrSparklines = async (
    identities: readonly { marketplaceId: string; asin: string }[],
    now = new Date()
): Promise<Map<string, BsrSparklinePoint[]>> => {
    const result = new Map<string, BsrSparklinePoint[]>(
        identities.map(identity => [enrichmentKey(identity), []])
    );
    if (!identities.length) return result;
    const ids = JSON.stringify(identities.map(item => ({ m: item.marketplaceId, a: item.asin })));
    const rows = await db.execute<{
        marketplaceId: string;
        asin: string;
        points: [number, number][];
    }>(sql`
        select i.m "marketplaceId", i.a asin, ${bsrSparklinePointsColumn(sql`p.id`, now)} points
        from jsonb_to_recordset(${ids}::jsonb) as i(m text,a text)
        join products p on p.marketplace_id=i.m and p.asin=i.a`);
    for (const row of rows) result.set(enrichmentKey(row), sampleBsrSparkline(row.points, now));
    return result;
};

export interface BsrSparklinePoint {
    at: string;
    salesRank: number;
}

const sparklineSamples = (now: Date) =>
    Array.from({ length: SPARKLINE_DAYS }, (_, index) => {
        const back = SPARKLINE_DAYS - 1 - index;
        return { back, minute: lastKeepaMinuteAt(new Date(now.getTime() - back * DAY_MS)) };
    });

const sparklineWindow = (now: Date) => {
    const samples = sparklineSamples(now);
    return { start: samples[0].minute, end: samples[samples.length - 1].minute };
};

/**
 * Samples fall every day (1,440 Keepa minutes) from `start`, so a point matters only if a sample
 * falls between it and the next point: the last sample before `next_m` is at or after `m`.
 */
const sampledPoint = (start: number) => {
    const day = sql.raw(String(DAY_MINUTES));
    return sql`(h.next_m is null or (h.next_m>${start}
        and least(${sql.raw(String(SPARKLINE_DAYS - 1))},(h.next_m-1-${start})/${day})
            >= greatest(0,(h.m-${start}+${sql.raw(String(DAY_MINUTES - 1))})/${day})))`;
};
