import { api } from "@/lib/trpc";

export const useAccessUsage = () => {
	const query = api.api.app.access.usage.useQuery(undefined, {
		retry: false,
	});

	return {
		usage: query.data ?? null,
		isLoading: query.isLoading,
		error: query.error,
	};
};
