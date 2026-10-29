import { api } from '@/lib/trpc';
import { metricsQueryOptions } from './metrics-polling';

export const useShortNameMetrics = () =>
    api.api.app.getProductShortNameMetricsSummary.useQuery(undefined, metricsQueryOptions);
