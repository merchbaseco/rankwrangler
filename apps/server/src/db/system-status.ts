import { sql } from 'drizzle-orm';
import { KEEPA_WEEKLY_AUTO_BSR_THRESHOLD } from '@/services/keepa-refresh-policy';
import { db } from './index';

/**
 * How much of the catalog is indexed, and the sales-history sync status of the active Merch
 * listings. Every Merch listing sits in exactly one of: `withHistory` (Keepa history imported),
 * `awaitingFirst` (inside the automatic Keepa tiers, first import still queued) or `notTracked`
 * (no history and outside the automatic tiers, so Keepa only syncs it on demand).
 */
export const readProductIndex = async (now: Date) => {
    const merch = sql`is_merch_listing and amazon_listing_status='active'`;
    const tracked = sql`${merch} and history_admission_state='admitted'
        and root_category_bsr is not null and root_category_bsr < ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}`;
    const [row] = await db.execute<Record<string, number>>(sql`
        select count(*)::int total,
            count(*) filter (where ${merch})::int merch,
            count(*) filter (where created_at > ${now.toISOString()}::timestamp - interval '24 hours')::int new_24h,
            count(*) filter (where ${merch} and keepa_fetched_at is not null)::int with_history,
            count(*) filter (where ${tracked} and keepa_fetched_at is null)::int awaiting_first,
            count(*) filter (where ${merch} and keepa_fetched_at is null and not (${tracked}))::int not_tracked
        from products`);
    const value = (name: string) => Number(row?.[name] ?? 0);
    return {
        total: value('total'),
        merch: value('merch'),
        new24h: value('new_24h'),
        history: {
            withHistory: value('with_history'),
            awaitingFirst: value('awaiting_first'),
            notTracked: value('not_tracked'),
        },
    };
};

/**
 * Provider calls by operation from the raw attempt log: the last hour against an hourly
 * allowance, and the last day's calls, throttles (HTTP 429) and other errors. A throttle is not
 * counted as an error, so the two read separately. Token refreshes are bookkeeping, not usage.
 */
export const readProviderCalls = async (now: Date) => {
    const rows = await db.execute<{
        provider: string;
        operation: string;
        calls_1h: number;
        calls_24h: number;
        throttled_24h: number;
        errors_24h: number;
    }>(sql`
        select provider, operation,
            count(*) filter (where attempted_at > ${now.toISOString()}::timestamp - interval '1 hour')::int calls_1h,
            count(*)::int calls_24h,
            count(*) filter (where status_code = 429)::int throttled_24h,
            count(*) filter (where is_error and status_code is distinct from 429)::int errors_24h
        from provider_attempts
        where attempted_at > ${now.toISOString()}::timestamp - interval '24 hours'
            and operation not like '%token'
        group by provider, operation order by provider, calls_24h desc`);
    return rows.map(row => ({
        provider: row.provider,
        operation: row.operation,
        calls1h: row.calls_1h,
        calls24h: row.calls_24h,
        throttled24h: row.throttled_24h,
        errors24h: row.errors_24h,
    }));
};
