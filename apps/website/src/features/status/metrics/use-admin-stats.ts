import { api } from '@/lib/trpc';
import { metricsQueryOptions } from './metrics-polling';

export const useAdminStats = () =>
    api.api.app.getAdminStats.useQuery(undefined, metricsQueryOptions);
