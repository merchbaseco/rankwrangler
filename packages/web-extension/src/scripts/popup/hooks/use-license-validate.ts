import { useMutation, useQueryClient } from "@tanstack/react-query";
import { browser } from "webextension-polyfill-ts";

// Validate license
const validateLicense = async (
	licenseKey: string,
): Promise<{
	isValid: boolean;
	error?: string;
	data?: any;
}> => {
	const response = await browser.runtime.sendMessage({
		type: "validateLicense",
		licenseKey: licenseKey,
	});

	if (!response.success) {
		throw new Error(response.error || "Failed to validate license");
	}

	return {
		isValid: response.valid,
		error: response.error,
		data: response.data,
	};
};

// Combined hook for license operations
export const useLicenseValidate = () => {
	const queryClient = useQueryClient();

	const validateMutation = useMutation({
		mutationFn: validateLicense,
		onSuccess: (_data, _licenseKey) => {
			// Invalidate the license status to force refetch from storage
			queryClient.invalidateQueries({ queryKey: ["licenseStatus"] });
		},
	});

	return {
		// Validate mutation
		validate: validateMutation.mutate,
		validateAsync: validateMutation.mutateAsync,
		isValidating: validateMutation.isPending,
		validateError: validateMutation.error,
	};
};
