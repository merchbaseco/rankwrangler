import { api } from "@/lib/trpc";

// Refreshed by useJobActivity when a job run is recorded; no interval refetch.
export const useKeywordJobsStatus = () =>
	api.api.app.jobs.keywordStatus.useQuery(undefined, {
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		retry: false,
	});
