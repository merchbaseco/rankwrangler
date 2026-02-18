import type { PgBoss } from 'pg-boss';
import {
    getDueKeepaHistoryRefreshQueueItems,
    getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens,
    holdKeepaHistoryRefreshQueueItems,
} from '@/services/keepa-history-refresh.js';

export async function processKeepaHistoryRefreshQueue(boss: PgBoss) {
    const batchSize = await getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens();

    if (batchSize <= 0) {
        return;
    }

    const queueItems = await getDueKeepaHistoryRefreshQueueItems(batchSize);
    if (queueItems.length === 0) {
        return;
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
}
