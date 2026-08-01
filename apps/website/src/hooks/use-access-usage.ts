import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/trpc";

export const useAccessUsage = () => {
	const { isLoaded, isSignedIn } = useAuth();
	const query = api.api.app.access.usage.useQuery(undefined, {
		enabled: isLoaded && Boolean(isSignedIn),
		retry: false,
	});

	return {
		usage: query.data ?? null,
		isLoading: !isLoaded || query.isLoading,
		error: query.error,
	};
};
