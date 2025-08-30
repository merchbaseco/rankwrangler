import { useQuery } from "@tanstack/react-query";
import { ProductCache } from "@/scripts/db/product-cache";

export const useProductCache = () => {
	const { data, refetch } = useQuery({
		queryKey: ["getCacheSize"],
		queryFn: ProductCache.getCacheSize,
		staleTime: 0, // Always consider data stale for real-time updates
		refetchInterval: 1000, // Auto-refetch every 1 second
		retry: 1,
	});

	return {
		cacheSize: data,
		refreshStats: refetch,
	};
};
