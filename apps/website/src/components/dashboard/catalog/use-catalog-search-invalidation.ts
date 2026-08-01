import { useMemo } from "react";
import { api } from "@/lib/trpc";
import { useRealtimeReconnect } from "@/lib/trpc-provider";

type CatalogSearchCompletedIdentity = {
	operationId: string;
	queryId: string;
};

export const createCatalogSearchInvalidationHandlers = ({
	operationId,
	queryId,
	invalidateOperation,
	invalidateQuery,
	invalidateRuns,
}: CatalogSearchCompletedIdentity & {
	invalidateOperation: (operationId: string) => Promise<unknown>;
	invalidateQuery: () => Promise<unknown>;
	invalidateRuns: () => Promise<unknown>;
}) => {
	const invalidateActiveReads = async () => {
		await Promise.all([
			invalidateOperation(operationId),
			invalidateQuery(),
			invalidateRuns(),
		]);
	};

	return {
		onCompleted: async (event: CatalogSearchCompletedIdentity) => {
			if (
				event.operationId !== operationId ||
				event.queryId !== queryId
			) {
				return;
			}
			await invalidateActiveReads();
		},
		onReconnect: invalidateActiveReads,
	};
};

export const useCatalogSearchInvalidation = ({
	operationId,
	queryId,
	term,
}: {
	operationId: string | null;
	queryId: string | null;
	term: string;
}) => {
	const utils = api.useUtils();
	const handlers = useMemo(
		() =>
			createCatalogSearchInvalidationHandlers({
				operationId: operationId ?? "",
				queryId: queryId ?? "",
				invalidateOperation: async (id) =>
					await utils.api.app.operation.get.invalidate({ id }),
				invalidateQuery: async () =>
					await utils.api.app.catalog.query.get.invalidate({ term }),
				invalidateRuns: async () =>
					await utils.api.app.catalog.run.list.invalidate({
						queryId: queryId ?? "",
						limit: 20,
					}),
			}),
		[operationId, queryId, term, utils],
	);
	const enabled = Boolean(operationId && queryId);

	api.api.app.catalog.search.completed.useSubscription(
		{ queryId: queryId ?? "00000000-0000-4000-8000-000000000000" },
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
