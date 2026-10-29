import { api } from '@/lib/trpc';
import { metricsQueryOptions } from './metrics-polling';

export const useCutoutMetrics = () =>
    api.api.app.getProductCutoutThumbnailMetricsSummary.useQuery(undefined, metricsQueryOptions);
