import { useMemo } from "react";
import { api } from "@/lib/trpc";
import { useRealtimeReconnect } from "@/lib/trpc-provider";

type ProductHistoryRefreshIdentity = {
	operationId: string;
	marketplaceId: string;
	asin: string;
};

export const createProductHistoryRefreshInvalidationHandlers = ({
	operationId,
	marketplaceId,
	asin,
	invalidateOperation,
	invalidateHistory,
}: ProductHistoryRefreshIdentity & {
	invalidateOperation: (operationId: string) => Promise<unknown>;
	invalidateHistory: () => Promise<unknown>;
}) => {
	const invalidateActiveReads = async () => {
		await Promise.all([invalidateOperation(operationId), invalidateHistory()]);
	};

	return {
		onCompleted: async (event: ProductHistoryRefreshIdentity) => {
			if (
				event.operationId !== operationId ||
				event.marketplaceId !== marketplaceId ||
				event.asin !== asin
			) {
				return;
			}

			await invalidateActiveReads();
		},
		onReconnect: invalidateActiveReads,
	};
};

export const useProductHistoryRefreshInvalidation = ({
	operationId,
	marketplaceId,
	asin,
	invalidateHistory,
}: {
	operationId: string | null;
	marketplaceId: string;
	asin: string;
	invalidateHistory: () => Promise<unknown>;
}) => {
	const utils = api.useUtils();
	const handlers = useMemo(
		() =>
			createProductHistoryRefreshInvalidationHandlers({
				operationId: operationId ?? "",
				marketplaceId,
				asin,
				invalidateOperation: async (id) =>
					await utils.api.app.operation.get.invalidate({ id }),
				invalidateHistory,
			}),
		[asin, invalidateHistory, marketplaceId, operationId, utils],
	);

	api.api.app.product.history.refresh.completed.useSubscription(
		{ marketplaceId, asin },
		{
			enabled: Boolean(operationId),
			onData: handlers.onCompleted,
		},
	);
	useRealtimeReconnect({
		enabled: Boolean(operationId),
		onReconnect: handlers.onReconnect,
	});
};
