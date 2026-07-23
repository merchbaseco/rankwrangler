import { useEffect, useRef, useState } from "react";
import { getProductHistoryOperationPollingInterval } from "@/components/dashboard/product-history-panel/product-history-operation-polling";
import { useProductHistoryRefreshInvalidation } from "@/components/dashboard/product-history-panel/use-product-history-refresh-invalidation";
import { toastManager } from "@/components/ui/toast";
import { api, type RouterOutputs } from "@/lib/trpc";

export const useProductHistoryLoad = ({
	marketplaceId,
	asin,
	observedOperation,
	invalidateHistory,
}: {
	marketplaceId: string;
	asin: string;
	observedOperation: AppProductHistoryOperation | null;
	invalidateHistory: () => Promise<unknown>;
}) => {
	const [activeOperation, setActiveOperation] =
		useState<AppProductHistoryOperation | null>(null);
	const completedOperationRef = useRef<string | null>(null);

	useEffect(() => {
		if (observedOperation?.status !== "pending") {
			return;
		}

		setActiveOperation((current) =>
			current?.id === observedOperation.id ? current : observedOperation,
		);
	}, [observedOperation]);

	const mutation = api.api.app.loadProductHistory.useMutation({
		onSuccess: (data) => {
			toastManager.add({
				type: "info",
				title: "Syncing Keepa…",
			});
			completedOperationRef.current = null;
			setActiveOperation(data.operation);
		},
		onError: (error) => {
			toastManager.add({
				type: "error",
				title: "Sync failed",
				description: error.message,
			});
		},
	});

	const operationQuery = api.api.app.operation.get.useQuery(
		{ id: activeOperation?.id ?? EMPTY_OPERATION_ID },
		{
			enabled: Boolean(activeOperation),
			initialData: activeOperation ?? undefined,
			refetchInterval: (query) =>
				getProductHistoryOperationPollingInterval(query.state.data),
		},
	);
	const terminalOperation =
		operationQuery.data?.status === "completed"
			? operationQuery.data
			: activeOperation?.status === "completed"
				? activeOperation
				: null;

	useProductHistoryRefreshInvalidation({
		operationId: activeOperation?.id ?? null,
		marketplaceId,
		asin,
		invalidateHistory,
	});

	useEffect(() => {
		if (
			!terminalOperation ||
			completedOperationRef.current === terminalOperation.id
		) {
			return;
		}

		completedOperationRef.current = terminalOperation.id;
		void invalidateHistory()
			.catch(() => undefined)
			.finally(() => {
				if (terminalOperation.error) {
					toastManager.add({
						type: "error",
						title: "Sync failed",
						description: terminalOperation.error.message,
					});
				} else {
					toastManager.add({
						type: "success",
						title: "Product history synced",
					});
				}
				setActiveOperation((current) =>
					current?.id === terminalOperation.id ? null : current,
				);
			});
	}, [invalidateHistory, terminalOperation]);

	return {
		isSyncing: mutation.isPending || activeOperation?.status === "pending",
		mutate: mutation.mutate,
	};
};

type AppProductHistoryOperation =
	RouterOutputs["api"]["app"]["operation"]["get"];

const EMPTY_OPERATION_ID = "00000000-0000-4000-8000-000000000000";
