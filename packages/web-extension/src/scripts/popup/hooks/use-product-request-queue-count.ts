import { useQuery } from '@tanstack/react-query';
import { getProductRequestCount } from '@/scripts/api/get-product';

export const useProductRequestQueueCount = () => {
    const { data, refetch } = useQuery({
        queryKey: ['productRequestQueueCount'],
        queryFn: async () => {
            return getProductRequestCount();
        },
        staleTime: 0, // Always consider data stale for real-time updates
        refetchInterval: 1000, // Auto-refetch every 1 second
        retry: 1,
    });

    return {
        queueCount: data,
        refreshQueueCount: refetch,
    };
};
