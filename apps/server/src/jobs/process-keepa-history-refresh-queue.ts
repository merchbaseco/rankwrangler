import type { PgBoss } from 'pg-boss';
import {
    getDueKeepaHistoryRefreshQueueItems,
    getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens,
    holdKeepaHistoryRefreshQueueItems,
} from '@/services/keepa-history-refresh.js';

export type ProcessKeepaHistoryRefreshQueueResult = {
    didWork: boolean;
    batchSize: number;
    dispatchedCount: number;
    reason: 'dispatched' | 'no_tokens' | 'no_due_items';
};

export async function processKeepaHistoryRefreshQueue(boss: PgBoss) {
    const batchSize = await getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens();

    if (batchSize <= 0) {
        return {
            didWork: false,
            batchSize,
            dispatchedCount: 0,
            reason: 'no_tokens',
        } satisfies ProcessKeepaHistoryRefreshQueueResult;
    }

    const queueItems = await getDueKeepaHistoryRefreshQueueItems(batchSize);
    if (queueItems.length === 0) {
        return {
            didWork: false,
            batchSize,
            dispatchedCount: 0,
            reason: 'no_due_items',
        } satisfies ProcessKeepaHistoryRefreshQueueResult;
    }

    await holdKeepaHistoryRefreshQueueItems(queueItems.map(item => item.id));

    for (const queueItem of queueItems) {
        await boss.send(
            'fetch-keepa-history-for-asin',
            {
                marketplaceId: queueItem.marketplaceId,
                asin: queueItem.asin,
            },
            {
                singletonKey: `fetch-keepa-history-for-asin:${queueItem.marketplaceId}:${queueItem.asin}`,
                retryLimit: 0,
            }
        );
    }

    return {
        didWork: true,
        batchSize,
        dispatchedCount: queueItems.length,
        reason: 'dispatched',
    } satisfies ProcessKeepaHistoryRefreshQueueResult;
}
