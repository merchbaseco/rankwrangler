import { useQuery } from '@tanstack/react-query';
import type { Stats } from '../../content/types';

const defaultStats: Stats = {
    totalRequests: 0,
    liveSuccessCount: 0,
    cacheSuccessCount: 0,
    failureCount: 0,
};

const fetchStats = async (): Promise<Stats & { queueCount: number; localCacheCount: number }> => {
    const result = await chrome.storage.local.get(['stats', 'activeQueue', 'bsrCacheCount']);
    
    return {
        ...(result.stats || defaultStats),
        queueCount: result.activeQueue?.count || 0,
        localCacheCount: result.bsrCacheCount?.count || 0
    };
};

export const useStats = () => {
    return useQuery({
        queryKey: ['stats'],
        queryFn: fetchStats,
        staleTime: 0, // Always consider data stale for real-time updates
        refetchInterval: 1000, // Auto-refetch every 1 second
        retry: 1,
    });
};