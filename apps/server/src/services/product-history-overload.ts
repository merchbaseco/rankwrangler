import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
} from '@/services/keepa-refresh-policy';

export const getHistoryAdmissionOverloadSnapshot = async (now = new Date()) => {
    const dueAt = sql`coalesce(${products.keepaFetchedAt} + CASE
        WHEN ${products.rootCategoryBsr} < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD} THEN interval '1 day'
        ELSE interval '7 days' END, ${products.historyAdmittedAt}, ${products.createdAt})`;
    const [row] = await db
        .select({
            overdueCount: sql<number>`count(*) FILTER (WHERE ${dueAt} <= ${now.toISOString()}::timestamp)::int`,
            oldestOverdueAt:
                sql<Date | null>`min(${dueAt}) FILTER (WHERE ${dueAt} <= ${now.toISOString()}::timestamp)`.mapWith(
                    products.historyAdmittedAt
                ),
        })
        .from(products)
        .where(
            and(
                eq(products.historyAdmissionState, 'admitted'),
                eq(products.amazonListingStatus, 'active'),
                eq(products.isMerchListing, true),
                lt(products.rootCategoryBsr, KEEPA_WEEKLY_AUTO_BSR_THRESHOLD)
            )
        );
    const oldestOverdueAt = row.oldestOverdueAt;
    return {
        overdueCount: row.overdueCount,
        oldestOverdueAt,
        newAdmissionsPaused:
            oldestOverdueAt !== null && now.getTime() - oldestOverdueAt.getTime() >= 7 * 86_400_000,
    };
};
