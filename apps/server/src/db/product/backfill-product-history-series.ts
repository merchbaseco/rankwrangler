import { inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { productHistoryPoints } from '@/db/schema';
import { KEEPA_MISSING_VALUE } from '@/services/keepa-history-series';
import { mergeSeriesOnConflict } from './product-history-series';

const FIRST_UUID = '00000000-0000-0000-0000-000000000000';

export type BackfillProductHistorySeriesResult = {
    readonly products: number;
    readonly seriesWritten: number;
    readonly lastProductId: string;
};

/**
 * One-off conversion of `product_history_points` into `product_history_series`, a bounded batch of
 * Products per statement in Product-id order. Each batch is one atomic upsert, so an interrupted
 * run resumes from the last logged Product id and a repeated run changes nothing. Series written
 * by Keepa fetches since the deploy win any minute they share with the old points.
 */
export const backfillProductHistorySeries = async ({
    afterProductId = FIRST_UUID,
    batchSize,
    limit = null,
    log = () => {},
}: {
    afterProductId?: string;
    batchSize: number;
    limit?: number | null;
    log?: (message: string) => void;
}): Promise<BackfillProductHistorySeriesResult> => {
    let cursor = afterProductId;
    let productCount = 0;
    let seriesWritten = 0;
    while (limit === null || productCount < limit) {
        const size = limit === null ? batchSize : Math.min(batchSize, limit - productCount);
        const batch = await db.execute<{ id: string }>(sql`
            select p.id from products p
            where p.id > ${cursor}::uuid
                and exists (select 1 from product_history_points h where h.product_id = p.id)
            order by p.id limit ${size}`);
        const ids = batch.map(row => row.id);
        if (ids.length === 0) break;

        const merge = mergeSeriesOnConflict('stored');
        const written = await db.execute(sql`
            insert into product_history_series
                (product_id, source, metric, category_id, keepa_minutes, keepa_values)
            select product_id, source, metric, category_id,
                array_agg(keepa_minutes order by keepa_minutes),
                array_agg(
                    case when is_missing or value_int is null then ${KEEPA_MISSING_VALUE}::int
                    else value_int end
                    order by keepa_minutes
                )
            from product_history_points
            where ${inArray(productHistoryPoints.productId, ids)}
            group by product_id, source, metric, category_id
            on conflict (product_id, source, metric, category_id) do update set
                keepa_minutes = ${merge.keepaMinutes},
                keepa_values = ${merge.keepaValues},
                updated_at = ${merge.updatedAt}`);

        productCount += ids.length;
        seriesWritten += Number(written.count ?? 0);
        cursor = ids[ids.length - 1];
        log(`${productCount} Products, ${seriesWritten} series; resume with --after ${cursor}`);
    }

    return { products: productCount, seriesWritten, lastProductId: cursor };
};

/** Products that still have old points but no series: zero once the backfill is complete. */
export const countProductsMissingHistorySeries = async () => {
    const [row] = await db.execute<{ missing: number }>(sql`
        select count(*)::int missing from products p
        where exists (select 1 from product_history_points h where h.product_id = p.id)
            and not exists (select 1 from product_history_series s where s.product_id = p.id)`);
    return row?.missing ?? 0;
};
