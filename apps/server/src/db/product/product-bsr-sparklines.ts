import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { keepaHistoryPointAt, lastKeepaMinuteAt } from '@/services/keepa-history-series';
import { enrichmentKey } from './product-stored-enrichment';

export const SPARKLINE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Samples main-category BSR once per day over the last thirty days for a page of Products.
 * History is a step function, so each sample is the value in force at that instant, carried in
 * from before the window when needed. One statement serves the whole page and returns only the
 * points inside the window plus the one in force at its start, never a Product's whole series.
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
        with points as (
            select i.m, i.a, h.m keepa_minute, h.v value
            from jsonb_to_recordset(${ids}::jsonb) as i(m text,a text)
            join products p on p.marketplace_id=i.m and p.asin=i.a
            join product_history_series s on s.product_id=p.id and s.source='keepa'
                and s.metric=${keepaHistoryMetricColumns.bsrMain}
            cross join lateral unnest(s.keepa_minutes, s.keepa_values) h(m,v)
            where h.m<=${end}
        )
        select m "marketplaceId", a asin, keepa_minute "keepaMinutes", value
        from points where keepa_minute>${start}
        union all
        select * from (
            select distinct on (m, a) m, a, keepa_minute, value from points
            where keepa_minute<=${start} order by m, a, keepa_minute desc
        ) carry`);
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
