import { api, type RouterInputs } from "@/lib/trpc";

export const useKeywordDirectoryCounts = (
	input: RouterInputs["api"]["app"]["keywordDirectoryCounts"],
) =>
	api.api.app.keywordDirectoryCounts.useQuery(input, {
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		placeholderData: (previous) => previous,
	});
