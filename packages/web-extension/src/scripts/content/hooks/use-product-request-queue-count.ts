import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { browser } from "webextension-polyfill-ts";
import type { Runtime } from "webextension-polyfill-ts";
import { ProductRequestTracker } from "@/scripts/db/product-request-tracker";

export const useProductRequestQueueCount = () => {
	const { data, refetch } = useQuery({
		queryKey: ["productRequestQueueCount"],
		queryFn: ProductRequestTracker.getRequestsInProgressCount,
		staleTime: 0, // Always consider data stale for real-time updates
		refetchInterval: 1000, // Auto-refetch every 1 second
		retry: 1,
	});

	useEffect(() => {
		const listener = (
			message: { type?: string },
			_sender: Runtime.MessageSender,
		): void => {
			if (message?.type === "cacheCleared") {
				void refetch();
			}
		};

		browser.runtime.onMessage.addListener(listener);

		return () => {
			browser.runtime.onMessage.removeListener(listener);
		};
	}, [refetch]);

	return {
		queueCount: data,
		refreshQueueCount: refetch,
	};
};
