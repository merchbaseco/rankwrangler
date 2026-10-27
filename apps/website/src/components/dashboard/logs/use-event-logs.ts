import { api } from "@/lib/trpc";
import type { RouterInputs } from "@/lib/trpc";
export const useEventLogs = (
	input: Exclude<RouterInputs["api"]["app"]["eventLogs"], void | undefined>,
) =>
	api.api.app.eventLogs.useInfiniteQuery(input, {
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
