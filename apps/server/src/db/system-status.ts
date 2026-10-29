import { type SQL, sql } from 'drizzle-orm';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy';
import {
    catalogQueriesOverdueCondition,
    keepaHistoryOverdueCondition,
    spapiCatalogOverdueCondition,
} from '@/services/service-health-queries';
import { SPAPI_REFRESH_POLICY_BUCKETS } from '@/services/spapi-refresh-policy';
import { db } from './index';

export const systemPipelines = ['spapi-catalog', 'keepa-history', 'catalog-queries'] as const;
export type SystemPipeline = (typeof systemPipelines)[number];

/**
 * Each scheduled pipeline's last write, its next scheduled due time, and how much is overdue
 * under the same conditions `/api/health` judges. Next due is the earliest item whose refresh
 * interval runs out; a pipeline with overdue work, or whose next item is already due, is due now.
 */
export const readSystemPipelines = async (now: Date) => {
    const asOf = now.toISOString();
    const spapiOverdue = spapiCatalogOverdueCondition(now) ?? sql`false`;
    const [products] = await db.execute<{
        spapi_last: string | null;
        spapi_next: string | null;
        spapi_overdue: number;
        keepa_last: string | null;
        keepa_next: string | null;
        keepa_overdue: number;
    }>(sql`
        select max(sp_api_fetched_at) spapi_last,
            min(sp_api_fetched_at + ${spapiInterval} * interval '1 millisecond') spapi_next,
            count(*) filter (where ${spapiOverdue})::int spapi_overdue,
            max(keepa_fetched_at) keepa_last,
            min(coalesce(keepa_fetched_at, created_at) + ${keepaInterval} * interval '1 millisecond')
                filter (where is_merch_listing and amazon_listing_status='active'
                    and history_admission_state='admitted') keepa_next,
            count(*) filter (where ${keepaHistoryOverdueCondition(now)})::int keepa_overdue
        from products`);
    const [queries] = await db.execute<{
        last: string | null;
        next: string | null;
        overdue: number;
    }>(sql`
        select max(latest_successful_run_at) last,
            min(next_due_at) filter (where tier<>'stored') next,
            count(*) filter (where ${catalogQueriesOverdueCondition(now)})::int overdue
        from catalog_queries`);
    const row = (
        pipeline: SystemPipeline,
        last: string | Date | null | undefined,
        next: string | Date | null | undefined,
        overdue: number | undefined
    ) => ({
        pipeline,
        lastRunAt: timestamp(last),
        nextDueAt: dueNoEarlierThan(timestamp(next), overdue ?? 0, asOf),
        overdue: overdue ?? 0,
    });
    return [
        row('spapi-catalog', products?.spapi_last, products?.spapi_next, products?.spapi_overdue),
        row('keepa-history', products?.keepa_last, products?.keepa_next, products?.keepa_overdue),
        row('catalog-queries', queries?.last, queries?.next, queries?.overdue),
    ];
};

/**
 * How much of the catalog is indexed and how deep: every Product, the active Merch listings, and
 * those listings split by Keepa history state. `awaitingFirst` has never had a history import;
 * `overdue` is past its refresh interval; `notScheduled` sits outside the automatic tiers.
 */
export const readProductIndex = async (now: Date) => {
    const merch = sql`is_merch_listing and amazon_listing_status='active'`;
    const scheduled = sql`${merch} and history_admission_state='admitted'
        and root_category_bsr is not null and root_category_bsr < ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}`;
    const [row] = await db.execute<Record<string, number>>(sql`
        select count(*)::int total,
            count(*) filter (where ${merch})::int merch,
            count(*) filter (where created_at > ${now.toISOString()}::timestamp - interval '24 hours')::int new_24h,
            count(*) filter (where ${scheduled} and keepa_fetched_at is null)::int awaiting_first,
            count(*) filter (where ${keepaHistoryOverdueCondition(now)} and keepa_fetched_at is not null)::int overdue,
            count(*) filter (where ${scheduled} and keepa_fetched_at is not null)::int scheduled_with_history,
            count(*) filter (where ${merch} and not (${scheduled}))::int not_scheduled
        from products`);
    const value = (name: string) => Number(row?.[name] ?? 0);
    return {
        total: value('total'),
        merch: value('merch'),
        new24h: value('new_24h'),
        history: {
            current: Math.max(value('scheduled_with_history') - value('overdue'), 0),
            overdue: value('overdue'),
            awaitingFirst: value('awaiting_first'),
            notScheduled: value('not_scheduled'),
        },
    };
};

/**
 * Provider calls by operation from the raw attempt log: the last hour against an hourly
 * allowance, and the last day's calls and errors. Token refreshes are bookkeeping, not usage.
 */
export const readProviderCalls = async (now: Date) => {
    const rows = await db.execute<{
        provider: string;
        operation: string;
        calls_1h: number;
        calls_24h: number;
        errors_24h: number;
    }>(sql`
        select provider, operation,
            count(*) filter (where attempted_at > ${now.toISOString()}::timestamp - interval '1 hour')::int calls_1h,
            count(*)::int calls_24h,
            count(*) filter (where is_error)::int errors_24h
        from provider_attempts
        where attempted_at > ${now.toISOString()}::timestamp - interval '24 hours'
            and operation not like '%token'
        group by provider, operation order by provider, calls_24h desc`);
    return rows.map(row => ({
        provider: row.provider,
        operation: row.operation,
        calls1h: row.calls_1h,
        calls24h: row.calls_24h,
        errors24h: row.errors_24h,
    }));
};

const bsrCase = (arms: readonly (readonly [SQL, number])[], fallback: SQL) =>
    sql`(case ${sql.join(
        arms.map(([when, ms]) => sql`when ${when} then ${ms}::bigint`),
        sql` `
    )} else ${fallback} end)`;

const spapiInterval = bsrCase(
    SPAPI_REFRESH_POLICY_BUCKETS.map(bucket => [
        bucket.maxBsrExclusive === null
            ? sql`root_category_bsr >= ${bucket.minBsrInclusive}`
            : sql`root_category_bsr >= ${bucket.minBsrInclusive} and root_category_bsr < ${bucket.maxBsrExclusive}`,
        bucket.refreshAfterMs,
    ]),
    sql`null`
);

const keepaInterval = bsrCase(
    [
        [sql`root_category_bsr < ${KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD}`, KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS],
        [sql`root_category_bsr < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}`, KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS],
        [sql`root_category_bsr < ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}`, KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS],
    ],
    sql`null`
);

const dueNoEarlierThan = (next: string | null, overdue: number, asOf: string) =>
    overdue > 0 || (next !== null && next < asOf) ? asOf : next;

// Raw reads return `timestamp` columns as UTC wall-clock text.
const timestamp = (value: string | Date | null | undefined) => {
    if (!value) {
        return null;
    }
    return value instanceof Date
        ? value.toISOString()
        : new Date(`${value.replace(' ', 'T')}Z`).toISOString();
};
