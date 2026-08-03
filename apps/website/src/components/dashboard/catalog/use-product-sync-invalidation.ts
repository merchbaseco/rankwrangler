import { useMemo } from "react";
import { api } from "@/lib/trpc";
import { useRealtimeReconnect } from "@/lib/trpc-provider";

export type ProductSyncIdentity = {
	marketplaceId: string;
	asin: string;
};

export const createProductSyncInvalidationHandlers = ({
	marketplaceId,
	pendingProducts,
	invalidateProduct,
}: {
	marketplaceId: string;
	pendingProducts: ProductSyncIdentity[];
	invalidateProduct: (identity: ProductSyncIdentity) => Promise<unknown>;
}) => ({
	onCompleted: async (event: ProductSyncIdentity) => {
		if (event.marketplaceId !== marketplaceId) {
			return;
		}
		await invalidateProduct(event);
	},
	onReconnect: async () => {
		await Promise.all(pendingProducts.map(identity => invalidateProduct(identity)));
	},
});

export const useProductSyncInvalidation = ({
	marketplaceId,
	pendingProducts,
}: {
	marketplaceId: string | null;
	pendingProducts: ProductSyncIdentity[];
}) => {
	const utils = api.useUtils();
	const handlers = useMemo(
		() =>
			createProductSyncInvalidationHandlers({
				marketplaceId: marketplaceId ?? "",
				pendingProducts,
				invalidateProduct: async (identity) =>
					await utils.api.app.product.get.invalidate(identity),
			}),
		[marketplaceId, pendingProducts, utils],
	);
	const enabled = Boolean(marketplaceId);

	api.api.app.product.sync.completed.useSubscription(
		{ marketplaceId: marketplaceId ?? "" },
		{
			enabled,
			onData: handlers.onCompleted,
		},
	);
	useRealtimeReconnect({
		enabled,
		onReconnect: handlers.onReconnect,
	});
};
