import { type SQLWrapper, sql } from 'drizzle-orm';
import {
    KEEPA_BIWEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_BIWEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy';
import { SPAPI_REFRESH_POLICY_BUCKETS } from '@/services/spapi-refresh-policy';

// Each refresh rule is reduced to one instant per Product, "due at", written as an immutable
// expression over the row. The same expression backs a partial expression index (product-schema)
// and the listing that reads it, so a listing reads only due rows, most overdue first, and every
// writer of the inputs keeps the index current without knowing about it. The expressions must stay
// textually identical between index and query; build both from these functions.

type ProductRefreshColumns = Readonly<{
    isMerchListing: SQLWrapper;
    amazonListingStatus: SQLWrapper;
    rootCategoryBsr: SQLWrapper;
    spApiFetchedAt: SQLWrapper;
    spApiResolvedAt: SQLWrapper;
    keepaFetchedAt: SQLWrapper;
    historyAdmissionState: SQLWrapper;
    createdAt: SQLWrapper;
}>;

/** Active Merch listings with a BSR: refreshed from SP-API on their BSR tier's cadence. */
export const spApiRefreshTracked = (c: ProductRefreshColumns) =>
    sql`(${c.isMerchListing} AND ${c.amazonListingStatus} = 'active' AND ${c.rootCategoryBsr} IS NOT NULL)`;

/** Last SP-API fetch plus the BSR tier's interval; never fetched is due at once. */
export const spApiRefreshDueAt = (c: ProductRefreshColumns) =>
    sql`(CASE WHEN ${c.spApiFetchedAt} IS NULL THEN '-infinity'::timestamp ${sql.join(
        SPAPI_REFRESH_POLICY_BUCKETS.map(bucket =>
            bucket.maxBsrExclusive === null
                ? sql`ELSE ${c.spApiFetchedAt} + ${interval(bucket.refreshAfterMs)}`
                : sql`WHEN ${c.rootCategoryBsr} < ${sql.raw(String(bucket.maxBsrExclusive))} THEN ${c.spApiFetchedAt} + ${interval(bucket.refreshAfterMs)}`
        ),
        sql` `
    )} END)`;

/**
 * Active Merch listings Amazon reports without a BSR, and Products only Keepa has seen as
 * non-Merch: one SP-API observation (with the variation-parent fallback) settles the latter.
 */
export const spApiBlindspotTracked = (c: ProductRefreshColumns) =>
    sql`(${c.amazonListingStatus} = 'active' AND ((${c.isMerchListing} AND ${c.rootCategoryBsr} IS NULL) OR (NOT ${c.isMerchListing} AND ${c.spApiFetchedAt} IS NULL AND ${c.spApiResolvedAt} IS NULL)))`;

/**
 * From the latest SP-API success: three days after a success in a Product's first three days,
 * fourteen after a later one while its first thirty days last, thirty afterwards. Never observed
 * is due at once. A probation re-check not taken before the thirty days end stays due.
 */
export const spApiBlindspotDueAt = (c: ProductRefreshColumns) => {
    const latest = sql`GREATEST(${c.spApiFetchedAt}, ${c.spApiResolvedAt})`;
    const probationDue = sql`${latest} + (CASE WHEN ${latest} < ${c.createdAt} + ${interval(3 * day)} THEN ${interval(3 * day)} ELSE ${interval(14 * day)} END)`;
    return sql`(CASE WHEN ${latest} IS NULL THEN '-infinity'::timestamp WHEN ${probationDue} < ${c.createdAt} + ${interval(30 * day)} THEN ${probationDue} ELSE ${latest} + ${interval(30 * day)} END)`;
};

/** History-admitted active Merch listings under the automatic BSR ceiling: Keepa's scheduled tiers. */
export const keepaRefreshTracked = (c: ProductRefreshColumns) =>
    sql`(${c.isMerchListing} AND ${c.amazonListingStatus} = 'active' AND ${c.historyAdmissionState} = 'admitted' AND ${c.rootCategoryBsr} < ${sql.raw(String(KEEPA_BIWEEKLY_AUTO_BSR_THRESHOLD))})`;

/** BSR-tier refresh interval for Keepa automatic history, shared by dispatch and product_stats. */
export const keepaRefreshInterval = (bsr: SQLWrapper) =>
    sql`(CASE WHEN ${bsr} < ${sql.raw(String(KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD))} THEN ${interval(KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS)} WHEN ${bsr} < ${sql.raw(String(KEEPA_DAILY_AUTO_BSR_THRESHOLD))} THEN ${interval(KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS)} WHEN ${bsr} < ${sql.raw(String(KEEPA_WEEKLY_AUTO_BSR_THRESHOLD))} THEN ${interval(KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS)} ELSE ${interval(KEEPA_BIWEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS)} END)`;

/** Last Keepa fetch plus the BSR tier's interval; never fetched is due at once. */
export const keepaRefreshDueAt = (c: ProductRefreshColumns) =>
    sql`(COALESCE(${c.keepaFetchedAt}, '-infinity'::timestamp) + ${keepaRefreshInterval(c.rootCategoryBsr)})`;

const day = 86_400_000;

const interval = (ms: number) => sql.raw(`interval '${ms / 1000} seconds'`);
