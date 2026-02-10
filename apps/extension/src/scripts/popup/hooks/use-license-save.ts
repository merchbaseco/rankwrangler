import { useMutation, useQueryClient } from "@tanstack/react-query";
import { browser } from "webextension-polyfill-ts";
import type { License } from "../../types/license";

// Save and validate license
const saveLicense = async (licenseKey: string): Promise<License | null> => {
	const response = await browser.runtime.sendMessage({
		type: "setLicense",
		licenseKey,
	});

	if (!response.success) {
		throw new Error(response.error || "Failed to save license");
	}

	return response.license;
};

// Combined hook for license operations
export const useLicenseSave = () => {
	const queryClient = useQueryClient();

	const saveMutation = useMutation({
		mutationFn: saveLicense,
		onSuccess: (newLicense) => {
			// Update the license in cache
			queryClient.setQueryData(["licenseStatus"], newLicense);
			// Invalidate to ensure fresh data
			queryClient.invalidateQueries({ queryKey: ["licenseStatus"] });
		},
	});

	return {
		save: saveMutation.mutate,
		saveAsync: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
		saveError: saveMutation.error,
		saveSuccess: saveMutation.isSuccess,
	};
};
