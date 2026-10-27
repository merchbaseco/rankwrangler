import { api } from "@/lib/trpc";
export const useSyncControl = () =>
	api.api.app.syncControl.get.useQuery(undefined, {
		staleTime: Infinity,
		retry: false,
	});
