import { useQuery } from "@tanstack/react-query";
import { ProductRequestTracker } from "@/scripts/db/product-request-tracker";

export const useProductRequestQueueCount = () => {
	const { data, refetch } = useQuery({
		queryKey: ["productRequestQueueCount"],
		queryFn: ProductRequestTracker.getRequestsInProgressCount,
		staleTime: 0, // Always consider data stale for real-time updates
		refetchInterval: 1000, // Auto-refetch every 1 second
		retry: 1,
	});

	return {
		queueCount: data,
		refreshQueueCount: refetch,
	};
};
