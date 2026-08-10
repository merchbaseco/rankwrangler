import { useCallback, useMemo, useState } from "react";
import { api, type RouterOutputs } from "@/lib/trpc";
import { useRealtimeReconnect } from "@/lib/trpc-provider";

type ProductRead = RouterOutputs["api"]["app"]["product"]["get"];

export const useProductDetails = ({
	marketplaceId,
	asin,
}: {
	marketplaceId: string;
	asin: string;
}) => {
	const utils = api.useUtils();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);
	const queryInput = useMemo(
		() => ({ asin, includeProvenance: true, marketplaceId, refresh: false }),
		[asin, marketplaceId],
	);
	const productQuery = api.api.app.product.get.useQuery(queryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	const refresh = useCallback(async () => {
		if (isRefreshing) {
			return;
		}

		setIsRefreshing(true);
		setRefreshError(null);
		try {
			const refreshed = await utils.api.app.product.get.fetch({
				...queryInput,
				refresh: true,
			});
			if (refreshed) {
				utils.api.app.product.get.setData(queryInput, refreshed as ProductRead);
			}
		} catch (error) {
			setRefreshError(error instanceof Error ? error.message : "Refresh failed");
		} finally {
			setIsRefreshing(false);
		}
	}, [isRefreshing, queryInput, utils]);

	const handleProductSync = useCallback(
		(event: { marketplaceId: string; asin: string }) => {
			if (event.marketplaceId !== marketplaceId || event.asin !== asin) {
				return;
			}
			void productQuery.refetch();
		},
		[asin, marketplaceId, productQuery.refetch],
	);

	api.api.app.product.sync.completed.useSubscription(
		{ marketplaceId },
		{ enabled: Boolean(marketplaceId && asin), onData: handleProductSync },
	);
	useRealtimeReconnect({
		enabled: Boolean(marketplaceId && asin),
		onReconnect: async () => {
			await productQuery.refetch();
		},
	});

	return {
		product: productQuery.data?.product ?? null,
		amazonListingStatus: productQuery.data?.amazonListingStatus ?? "pending",
		provenance: productQuery.data?.provenance ?? null,
		isLoading: productQuery.isLoading,
		isRefreshing,
		refresh,
		refreshError,
	};
};
