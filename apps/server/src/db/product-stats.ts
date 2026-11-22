import { eq, type SQL, sql } from 'drizzle-orm';
import { keepaRefreshInterval } from '@/db/product-refresh-due';
import {
    KEEPA_BIWEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
} from '@/services/keepa-refresh-policy';
import { KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE } from '@/services/product-history-overload';
import {
    BSR_THRESHOLD_1M,
    BSR_THRESHOLD_3M,
    BSR_THRESHOLD_200K,
    BSR_THRESHOLD_500K,
} from '@/services/spapi-refresh-policy';
import { db } from './index';
import { productStats } from './product-stats-schema';

export type ProductStats = typeof productStats.$inferSelect;

// Taken by history admission too: a pass and an admission never interleave, so the admitted
// population a pass counts and the admissions added to it afterwards never overlap or go missing.
export const lockHistoryAdmission = (tx: Pick<typeof db, 'execute'>) =>
    tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('product-history-admission', 0))`);

/** The latest snapshot, or null before the first pass. */
export const readProductStats = async (
    database: Pick<typeof db, 'select'> = db
): Promise<ProductStats | null> => {
    const [row] = await database.select().from(productStats).where(eq(productStats.id, 1));
    return row ?? null;
};

/**
 * Recounts the snapshot in one sequential pass over Products and one `attempted_at` range over the
 * day's provider attempts, replacing the row in the caller's transaction. A Products scan larger
 * than a quarter of shared buffers reads through a small ring, so the pass does not evict the
 * cache.
 */
export const refreshProductStats = async (
    tx: Pick<typeof db, 'execute'>,
    now: Date
): Promise<void> => {
    const at = sql`${now.toISOString()}::timestamp`;
    await lockHistoryAdmission(tx);
    await tx.execute(sql`delete from product_stats`);
    await tx.execute(sql`
        insert into product_stats (id, observed_at, products, merch, new_24h, merch_with_history,
            merch_awaiting_first, merch_not_tracked, merch_missing_bsr, sp_api_lt_200k,
            sp_api_200k_to_500k, sp_api_500k_to_1m, sp_api_1m_to_3m, sp_api_gte_3m, sp_api_non_auto,
            history_twice_daily, history_daily, history_weekly, history_biweekly,
            keepa_waiting_daily, keepa_waiting_weekly, keepa_waiting_biweekly, keepa_on_demand,
            keepa_merch_missing_bsr, keepa_non_merch, history_overdue, history_oldest_overdue_at,
            provider_calls)
        select 1, ${at}, count(*), count(*) filter (where merch),
            count(*) filter (where created_at>${at}-interval '24 hours'),
            count(*) filter (where merch and keepa_fetched_at is not null and not waiting),
            count(*) filter (where tracked and keepa_fetched_at is null),
            count(*) filter (where merch and keepa_fetched_at is null and not tracked and not waiting),
            count(*) filter (where merch and bsr is null),
            count(*) filter (where is_merch_listing and bsr<${BSR_THRESHOLD_200K}),
            count(*) filter (where is_merch_listing and bsr>=${BSR_THRESHOLD_200K}
                and bsr<${BSR_THRESHOLD_500K}),
            count(*) filter (where is_merch_listing and bsr>=${BSR_THRESHOLD_500K}
                and bsr<${BSR_THRESHOLD_1M}),
            count(*) filter (where is_merch_listing and bsr>=${BSR_THRESHOLD_1M}
                and bsr<${BSR_THRESHOLD_3M}),
            count(*) filter (where is_merch_listing and bsr>=${BSR_THRESHOLD_3M}),
            count(*) filter (where not is_merch_listing or bsr is null),
            count(*) filter (where tracked and bsr<${KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where tracked and bsr>=${KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD}
                and bsr<${KEEPA_DAILY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where tracked and bsr>=${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                and bsr<${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where tracked and bsr>=${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where waiting and bsr<${KEEPA_DAILY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where waiting and bsr>=${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                and bsr<${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where waiting and bsr>=${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where is_merch_listing and bsr>=${KEEPA_BIWEEKLY_AUTO_BSR_THRESHOLD}),
            count(*) filter (where is_merch_listing and bsr is null),
            count(*) filter (where not is_merch_listing),
            count(*) filter (where tracked and due_at<=${at}),
            coalesce(
                (array_agg(due_at order by due_at) filter (where tracked and due_at<=${at}))[${sql.raw(String(KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE))}],
                min(due_at) filter (where tracked and due_at<=${at})
            ),
            (${providerCalls(at)})
        from (
            select is_merch_listing, root_category_bsr bsr, keepa_fetched_at, created_at,
                is_merch_listing and amazon_listing_status='active' merch,
                is_merch_listing and amazon_listing_status='active'
                    and history_admission_state='admitted'
                    and root_category_bsr is not null
                    and root_category_bsr<${KEEPA_BIWEEKLY_AUTO_BSR_THRESHOLD} tracked,
                is_merch_listing and amazon_listing_status='active'
                    and history_admission_state<>'admitted'
                    and root_category_bsr is not null
                    and root_category_bsr<${KEEPA_BIWEEKLY_AUTO_BSR_THRESHOLD} waiting,
                coalesce(keepa_fetched_at + ${keepaRefreshInterval(sql.raw('root_category_bsr'))},
                    history_admitted_at, created_at) due_at
            from products
        ) p
    `);
};

// Provider calls by operation: the last hour and the last day's calls, throttles (HTTP 429) and
// other errors. A throttle is not an error, so the two read separately; token refreshes are
// bookkeeping, not usage.
const providerCalls = (at: SQL) => sql`
    select coalesce(jsonb_agg(c order by c.provider, c."calls24h" desc), '[]'::jsonb) from (
        select provider, operation,
            count(*) filter (where attempted_at>${at}-interval '1 hour')::int "calls1h",
            count(*)::int "calls24h",
            count(*) filter (where status_code=429)::int "throttled24h",
            count(*) filter (where is_error and status_code is distinct from 429)::int "errors24h"
        from provider_attempts
        where attempted_at>${at}-interval '24 hours' and operation not like '%token'
        group by provider, operation
    ) c`;
