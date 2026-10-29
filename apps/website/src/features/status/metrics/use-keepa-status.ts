import { api } from '@/lib/trpc';
import { metricsQueryOptions } from './metrics-polling';

export const useKeepaStatus = () =>
    api.api.app.getKeepaStatus.useQuery(undefined, metricsQueryOptions);
