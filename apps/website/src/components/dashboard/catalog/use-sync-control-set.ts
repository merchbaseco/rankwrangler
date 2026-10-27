import { api } from "@/lib/trpc";
export const useSyncControlSet = () => {
	const utils = api.useUtils();
	return api.api.app.syncControl.set.useMutation({
		onSuccess: (data) => {
			utils.api.app.syncControl.get.setData(undefined, data);
		},
	});
};
