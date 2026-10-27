import { useKeywordDirectoryRows } from "./use-keyword-directory-rows";
import { useEffect, useRef } from "react";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/lib/trpc";
import {
	patchKeywordDirectory,
	type DirectoryInput,
} from "./keyword-directory-cache";
import { createKeywordDirectoryEventUpdates } from "./keyword-directory-event-updates";

export const useKeywordDirectoryChanged = (input: DirectoryInput) => {
	const utils = api.useUtils();
	const queryClient = useQueryClient();
	const readRows = useKeywordDirectoryRows();
	const updates = useRef<ReturnType<
		typeof createKeywordDirectoryEventUpdates
	> | null>(null);
	useEffect(() => {
		const directory = utils.api.app.keywordDirectory;
		const queryKey = getQueryKey(api.api.app.keywordDirectory, input, "infinite");
		const listener = createKeywordDirectoryEventUpdates({
			view: () => directory.getInfiniteData(input)?.pages[0]?.view,
			read: (terms, view) => readRows({ terms, view }),
			patch: (rows, terms) => {
				if (queryClient.isFetching({ queryKey })) return false;
				directory.setInfiniteData(input, (previous) =>
					patchKeywordDirectory(previous, rows, terms, input),
				);
				// Other filters' cached pages missed this change; refetch them when shown again.
				void directory.invalidate(undefined, {
					predicate: (query) => query.queryHash !== hashKey(queryKey),
					refetchType: "none",
				});
				return true;
			},
			reconcile: () => directory.invalidate(input),
		});
		updates.current = listener;
		return () => {
			listener.dispose();
			updates.current = null;
		};
	}, [input, utils, queryClient, readRows]);
	api.api.app.keyword.directory.changed.useSubscription(undefined, {
		onData: (event) => updates.current?.onData(event),
	});
};
