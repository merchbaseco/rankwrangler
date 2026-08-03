import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	getCatalogOperationPollingInterval,
	isCatalogRunReadPending,
	normalizeCatalogTerm,
	readCatalogSession,
	resolveCatalogQuerySwitch,
	writeCatalogSession,
} from "./catalog-search-state";
import { useCatalogSearchInvalidation } from "./use-catalog-search-invalidation";
import { api } from "@/lib/trpc";

const EMPTY_UUID = "00000000-0000-4000-8000-000000000000";

const getInitialSession = () => {
	if (typeof window === "undefined") {
		return { term: "", operationId: null, queryId: null };
	}
	return readCatalogSession(new URL(window.location.href));
};

export const useCatalogSearchExplorer = () => {
	const initialSession = useRef(getInitialSession());
	const [inputTerm, setInputTerm] = useState(initialSession.current.term);
	const [activeTerm, setActiveTerm] = useState(initialSession.current.term);
	const [operationId, setOperationId] = useState<string | null>(
		initialSession.current.operationId,
	);
	const [operationQueryId, setOperationQueryId] = useState<string | null>(
		initialSession.current.queryId,
	);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [isRequestStarting, setIsRequestStarting] = useState(false);
	const requestSequence = useRef(0);
	const handledOperation = useRef<string | null>(null);
	const utils = api.useUtils();

	const query = api.api.app.catalog.query.get.useQuery(
		{ term: activeTerm || "catalog" },
		{ enabled: Boolean(activeTerm) && !isRequestStarting, retry: 2 },
	);
	const operation = api.api.app.operation.get.useQuery(
		{ id: operationId ?? EMPTY_UUID },
		{
			enabled: Boolean(operationId),
			refetchInterval: (operationQuery) =>
				getCatalogOperationPollingInterval(
					operationQuery.state.data,
					Boolean(operationQuery.state.error),
				),
			retry: false,
		},
	);
	const runs = api.api.app.catalog.run.list.useInfiniteQuery(
		{ queryId: query.data?.id ?? EMPTY_UUID, limit: 20 },
		{
			enabled: Boolean(query.data?.id),
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		},
	);
	const selectedRun = api.api.app.catalog.run.get.useQuery(
		{ id: selectedRunId ?? EMPTY_UUID },
		{ enabled: Boolean(selectedRunId) },
	);
	const search = api.api.app.catalog.search.request.useMutation();
	const runItems = useMemo(
		() => runs.data?.pages.flatMap((page) => page.items) ?? [],
		[runs.data],
	);

	useCatalogSearchInvalidation({
		operationId,
		queryId: query.data?.id ?? null,
		term: activeTerm,
	});

	useEffect(() => {
		if (selectedRunId || !query.data?.latestRun) {
			return;
		}
		setSelectedRunId(query.data.latestRun.id);
	}, [query.data?.latestRun, selectedRunId]);

	useEffect(() => {
		const terminal = operation.data?.status === "completed" ? operation.data : null;
		if (!terminal || handledOperation.current === terminal.id) {
			return;
		}
		const activeQueryId = query.data?.id;
		if (!activeQueryId) {
			return;
		}
		if (operationQueryId !== activeQueryId) {
			handledOperation.current = terminal.id;
			setOperationId(null);
			setOperationQueryId(null);
			persistSession({ term: activeTerm, operationId: null, queryId: null });
			return;
		}
		handledOperation.current = terminal.id;
		if (terminal.resource?.type !== "catalogSearchRun") {
			return;
		}
		if (terminal.resource.queryId !== activeQueryId) {
			setOperationId(null);
			setOperationQueryId(null);
			persistSession({ term: activeTerm, operationId: null, queryId: null });
			return;
		}

		setSelectedRunId(terminal.resource.runId);
		void Promise.all([
			utils.api.app.catalog.query.get.invalidate({ term: activeTerm }),
			utils.api.app.catalog.run.list.invalidate({
				queryId: terminal.resource.queryId,
				limit: 20,
			}),
			utils.api.app.catalog.run.get.invalidate({
				id: terminal.resource.runId,
			}),
		]);
	}, [activeTerm, operation.data, operationQueryId, query.data?.id, utils]);

	const submitSearch = useCallback(
		async (maxAgeSeconds = 24 * 60 * 60) => {
			const term = normalizeCatalogTerm(inputTerm);
			if (!term) {
				return;
			}
			const sequence = requestSequence.current + 1;
			requestSequence.current = sequence;
			const switched = resolveCatalogQuerySwitch(
				{
					term: activeTerm,
					operationId,
					queryId: operationQueryId,
					selectedRunId,
				},
				term,
			);
			setActiveTerm(switched.term);
			setOperationId(switched.operationId);
			setOperationQueryId(switched.queryId);
			setSelectedRunId(switched.selectedRunId);
			setIsRequestStarting(true);
			handledOperation.current = null;
			persistSession({
				term,
				operationId: switched.operationId,
				queryId: switched.queryId,
			});

			try {
				const result = await search.mutateAsync({ term, maxAgeSeconds });
				if (sequence !== requestSequence.current) {
					return;
				}
				if (result.status === "ready") {
					utils.api.app.catalog.run.get.setData(
						{ id: result.run.id },
						result.run,
					);
					setSelectedRunId(result.run.id);
					setOperationId(null);
					setOperationQueryId(null);
					persistSession({ term, operationId: null, queryId: null });
					await Promise.all([
						utils.api.app.catalog.query.get.invalidate({ term }),
						utils.api.app.catalog.run.list.invalidate({
							queryId: result.run.query.id,
							limit: 20,
						}),
					]);
					return;
				}
				setOperationId(result.operation.id);
				setOperationQueryId(result.queryId);
				persistSession({
					term,
					operationId: result.operation.id,
					queryId: result.queryId,
				});
			} catch {
				// The mutation's public error state owns rendering.
			} finally {
				if (sequence === requestSequence.current) {
					setIsRequestStarting(false);
				}
			}
		},
		[
			activeTerm,
			inputTerm,
			operationId,
			operationQueryId,
			search,
			selectedRunId,
			utils,
		],
	);

	const terminalError =
		operation.data?.status === "completed" &&
		operationQueryId === query.data?.id
			? operation.data.error
			: null;
	const runReadError =
		operation.data?.status === "completed" &&
		Boolean(operation.data.resource) &&
		selectedRun.isError
			? "Search results could not be loaded. Retry the search or reload this page."
			: null;
	const isWaitingForRun = isCatalogRunReadPending({
		hasOperation: Boolean(operationId),
		hasOperationReadError: operation.isError,
		hasRunReadError: Boolean(runReadError),
		hasSelectedRun: Boolean(selectedRun.data),
		operationHasResource: Boolean(operation.data?.resource),
		operationStatus: operation.data?.status,
	});
	const operationReadError = operation.isError
		? "Search status could not be refreshed. Retrying automatically."
		: null;

	return {
		activeTerm,
		inputTerm,
		isSearching: isRequestStarting || search.isPending || isWaitingForRun,
		operationError:
			terminalError?.message ??
			operationReadError ??
			runReadError ??
			search.error?.message ??
			null,
		query: query.data ?? null,
		runs: runItems,
		hasMoreRuns: Boolean(runs.hasNextPage),
		isLoadingMoreRuns: runs.isFetchingNextPage,
		loadMoreRuns: runs.fetchNextPage,
		selectedRun: selectedRun.data ?? null,
		selectedRunId,
		setInputTerm,
		setSelectedRunId,
		submitSearch,
	};
};

const persistSession = ({
	term,
	operationId,
	queryId,
}: {
	term: string;
	operationId: string | null;
	queryId: string | null;
}) => {
	if (typeof window === "undefined") {
		return;
	}
	const url = writeCatalogSession(new URL(window.location.href), {
		term,
		operationId,
		queryId,
	});
	window.history.replaceState(null, "", url);
};
