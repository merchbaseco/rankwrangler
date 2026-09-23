import { adminProcedure } from '@/api/trpc';
import { getProductShortNameMetrics } from '@/services/product-short-name-metrics';

export const getProductShortNameMetricsSummary = adminProcedure.query(async () => {
    return await getProductShortNameMetrics();
});
