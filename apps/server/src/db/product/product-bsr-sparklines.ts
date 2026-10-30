import { sql } from 'drizzle-orm';
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
 * Samples main-category BSR once per day over the last thirty days for a page of Products.
 * History is a step function, so each sample is the value in force at that instant, carried in
 * from before the window when needed. One statement serves the whole page and returns only the
 * points inside the window plus the one in force at its start, never a Product's whole series.
 * Series are sorted, so each reads only its tail when the tail already reaches back past the
 * window start, and the carry-in is found per series instead of by sorting the whole page. Points
 * superseded before the next daily sample never reach a sparkline and are not returned.
 * Samples before a Product's first point, and samples where Keepa recorded no rank, are omitted.
 */
export const readBsrSparklines = async (
    identities: readonly { marketplaceId: string; asin: string }[],
    now = new Date()
): Promise<Map<string, BsrSparklinePoint[]>> => {
    const result = new Map<string, BsrSparklinePoint[]>(
        identities.map(identity => [enrichmentKey(identity), []])
    );
    if (!identities.length) return result;
    const ids = JSON.stringify(identities.map(item => ({ m: item.marketplaceId, a: item.asin })));
    const samples = Array.from({ length: SPARKLINE_DAYS }, (_, index) => {
        const back = SPARKLINE_DAYS - 1 - index;
        return { back, minute: lastKeepaMinuteAt(new Date(now.getTime() - back * DAY_MS)) };
    });
    const start = samples[0].minute;
    const end = samples[samples.length - 1].minute;
    const rows = await db.execute<{
        marketplaceId: string;
        asin: string;
        keepaMinutes: number;
        value: number;
    }>(sql`
        select i.m "marketplaceId", i.a asin, h.m "keepaMinutes", h.v value
        from jsonb_to_recordset(${ids}::jsonb) as i(m text,a text)
        join products p on p.marketplace_id=i.m and p.asin=i.a
        join product_history_series s on s.product_id=p.id and s.source='keepa'
            and s.metric=${keepaHistoryMetricColumns.bsrMain}
        cross join lateral (
            select case when s.keepa_minutes[t.i]<=${start} then s.keepa_minutes[t.i:] else s.keepa_minutes end minutes,
                case when s.keepa_minutes[t.i]<=${start} then s.keepa_values[t.i:] else s.keepa_values end vals
            from (select greatest(cardinality(s.keepa_minutes)-${SERIES_TAIL - 1},1) i) t
        ) w
        cross join lateral (
            select h.m, h.v, lead(h.m) over (order by h.ord) next_m
            from unnest(w.minutes, w.vals) with ordinality h(m,v,ord)
        ) h
        where h.m<=${end} and (h.m>${start} or h.next_m is null or h.next_m>${start})
            and ${sampledPoint(start)}`);
    const byProduct = new Map<string, { keepaMinutes: number; value: number }[]>();
    for (const row of rows) {
        const key = enrichmentKey(row);
        const points = byProduct.get(key) ?? [];
        points.push({ keepaMinutes: row.keepaMinutes, value: row.value });
        byProduct.set(key, points);
    }
    for (const [key, points] of byProduct) {
        points.sort((left, right) => left.keepaMinutes - right.keepaMinutes);
        for (const { back, minute } of samples) {
            const point = keepaHistoryPointAt(points, minute);
            if (!point || point.value < 0) continue;
            result.get(key)?.push({
                at: new Date(now.getTime() - back * DAY_MS).toISOString(),
                salesRank: point.value,
            });
        }
    }
    return result;
};

export interface BsrSparklinePoint {
    at: string;
    salesRank: number;
}

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
