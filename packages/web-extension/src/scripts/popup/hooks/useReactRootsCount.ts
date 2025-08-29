import { useQuery } from '@tanstack/react-query';

interface ReactRootsData {
    count: number;
    timestamp: number;
}

const fetchReactRootsCount = async (): Promise<number> => {
    const result = await chrome.storage.local.get(['reactRootsCount']);
    const data = result.reactRootsCount as ReactRootsData | undefined;
    return data?.count ?? 0;
};

export const useReactRootsCount = () => {
    return useQuery({
        queryKey: ['reactRootsCount'],
        queryFn: fetchReactRootsCount,
        staleTime: 0, // Always consider data stale for real-time updates
        refetchInterval: 1000, // Refresh every 1 second
        retry: 1,
    });
};