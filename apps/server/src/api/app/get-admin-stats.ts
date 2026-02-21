import { adminProcedure } from '@/api/trpc.js';
import { getAdminTimeSeries } from '@/services/admin-stats.js';

export const getAdminStats = adminProcedure.query(async () => {
    return getAdminTimeSeries();
});
