import { adminProcedure } from '@/api/trpc';
import { getProductCutoutThumbnailMetrics } from '@/services/product-cutout-thumbnail-metrics';

export const getProductCutoutThumbnailMetricsSummary = adminProcedure.query(async () => {
    return await getProductCutoutThumbnailMetrics();
});
