import { appProcedure } from '@/api/trpc';
import { getKeepaHistoryRefreshQueueStats } from '@/services/keepa-history-refresh-stats';

export const getKeepaStatus = appProcedure.query(async () => {
    return getKeepaHistoryRefreshQueueStats();
});
