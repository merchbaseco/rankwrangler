import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { enrichmentKey } from './product-stored-enrichment';

export const SPARKLINE_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Samples main-category BSR once per day over the last thirty days for a page of Products.
 * History is a step function, so each sample is the value in force at that instant, carried in
 * from before the window when needed. One bounded statement serves the whole page: at most thirty
 * backward index probes per Product, never the raw change points. Samples before a Product's
 * first point, and samples where Keepa recorded no rank, are omitted.
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
    const rows = await db.execute<{
        marketplaceId: string;
        asin: string;
        back: number;
        value: number | null;
    }>(sql`
        select i.m "marketplaceId",i.a asin,d.back,v.value_int value
        from jsonb_to_recordset(${ids}::jsonb) as i(m text,a text)
        cross join generate_series(${SPARKLINE_DAYS - 1}::int,0,-1) as d(back)
        cross join lateral (
            select h.value_int from product_history_points h
            where h.marketplace_id=i.m and h.asin=i.a and h.metric=${keepaHistoryMetricColumns.bsrMain}
                and h.observed_at<=${now.toISOString()}::timestamp-d.back*interval '1 day'
            order by h.observed_at desc limit 1
        ) v
        order by i.m,i.a,d.back desc`);
    for (const row of rows) {
        if (row.value === null) continue;
        result.get(enrichmentKey(row))?.push({
            at: new Date(now.getTime() - row.back * DAY_MS).toISOString(),
            salesRank: row.value,
        });
    }
    return result;
};

export interface BsrSparklinePoint {
    at: string;
    salesRank: number;
}
