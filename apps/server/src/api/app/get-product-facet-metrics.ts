import { adminProcedure } from '@/api/trpc.js';
import { getProductFacetMetrics } from '@/services/product-facet-metrics.js';

export const getProductFacetMetricsSummary = adminProcedure.query(async () => {
    return getProductFacetMetrics();
});
