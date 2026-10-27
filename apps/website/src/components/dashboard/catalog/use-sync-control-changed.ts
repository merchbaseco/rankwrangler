import { api } from "@/lib/trpc";
export const useSyncControlChanged = () => {
	const utils = api.useUtils();
	api.api.app.syncControl.changed.useSubscription(undefined, {
		onData: () => {
			void utils.api.app.syncControl.get.invalidate();
		},
	});
};
