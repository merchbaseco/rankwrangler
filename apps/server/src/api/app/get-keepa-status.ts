import { appProcedure } from '@/api/trpc.js';
import { getKeepaHistoryRefreshQueueStats } from '@/services/keepa-history-refresh.js';

export const getKeepaStatus = appProcedure.query(async () => {
    return getKeepaHistoryRefreshQueueStats();
});
