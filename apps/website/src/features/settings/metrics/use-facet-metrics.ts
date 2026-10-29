import { api } from '@/lib/trpc';
import { metricsQueryOptions } from './metrics-polling';

export const useFacetMetrics = () =>
    api.api.app.getProductFacetMetricsSummary.useQuery(undefined, metricsQueryOptions);
