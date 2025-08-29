import { useQuery } from '@tanstack/react-query';
import type { Stats } from '../../content/types';

const fetchStats = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'getStats' });
    if (!response || !response.stats) {
        throw new Error('Failed to load stats');
    }
    return {
        ...response.stats,
        queueCount: response.queueCount || 0
    } satisfies Stats & { queueCount: number };
};

export const useStats = () => {
    return useQuery({
        queryKey: ['stats'],
        queryFn: fetchStats,
        staleTime: 5 * 1000, // Consider data fresh for 5 seconds
        refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
        retry: 2,
    });
};