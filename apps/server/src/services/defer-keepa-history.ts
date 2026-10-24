import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryRefreshQueue } from '@/db/schema';

export const deferKeepaHistory = async ({
    marketplaceId,
    asin,
    retryAt,
}: {
    marketplaceId: string;
    asin: string;
    retryAt: Date;
}) => {
    await db
        .update(keepaHistoryRefreshQueue)
        .set({ nextAttemptAt: retryAt, updatedAt: new Date() })
        .where(
            and(
                eq(keepaHistoryRefreshQueue.marketplaceId, marketplaceId),
                eq(keepaHistoryRefreshQueue.asin, asin)
            )
        );
};
