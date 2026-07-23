import { pollProductHistoryOperation } from "@/components/dashboard/product-history-panel/poll-product-history-operation";
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/trpc";

export const useProductHistoryLoad = ({
	onCompleted,
}: {
	onCompleted: () => Promise<unknown>;
}) => {
	const utils = api.useUtils();

	return api.api.app.loadProductHistory.useMutation({
		onSuccess: async (data) => {
			toastManager.add({
				type: "info",
				title: data.created
					? "Product history collection queued"
					: "Product history collection already pending",
			});

			try {
				const operation = await pollProductHistoryOperation({
					operation: data.operation,
					getOperation: async (id) =>
						await utils.client.api.app.operation.get.query({ id }),
				});

				if (operation.error) {
					toastManager.add({
						type: "error",
						title: "Sync failed",
						description: operation.error.message,
					});
					return;
				}

				toastManager.add({
					type: "success",
					title: "Product history synced",
				});
				await onCompleted();
			} catch {
				toastManager.add({
					type: "error",
					title: "Sync status unavailable",
					description: "Retry the Product history refresh.",
				});
			}
		},
		onError: (error) => {
			toastManager.add({
				type: "error",
				title: "Sync failed",
				description: error.message,
			});
		},
	});
};
