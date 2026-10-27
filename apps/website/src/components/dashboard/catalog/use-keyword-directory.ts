import { api } from "@/lib/trpc";
import type { DirectoryInput } from "./keyword-directory-cache";
export const useKeywordDirectory = (input: DirectoryInput) =>
	api.api.app.keywordDirectory.useInfiniteQuery(input, {
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
