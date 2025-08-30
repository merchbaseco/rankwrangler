import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browser } from "webextension-polyfill-ts";
import type { LicenseStatus } from "../../content/types";

// Fetch license status
const fetchLicenseStatus = async (): Promise<LicenseStatus> => {
	const response = await browser.runtime.sendMessage({
		type: "getLicenseStatus",
	});
	if (!response.success) {
		throw new Error(response.error || "Failed to load license status");
	}
	return response.status;
};

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

// Save and validate license
const saveLicense = async (licenseKey: string): Promise<LicenseStatus> => {
	const response = await browser.runtime.sendMessage({
		type: "setLicense",
		licenseKey: licenseKey,
	});

	if (!response.success) {
		throw new Error(response.error || "Failed to save license");
	}

	return response.status;
};

// Hook to get license status
export const useLicenseStatus = () => {
	return useQuery({
		queryKey: ["licenseStatus"],
		queryFn: fetchLicenseStatus,
		staleTime: 30 * 1000, // Consider data fresh for 30 seconds
		retry: 1,
	});
};

// Hook to validate license (mutation)
export const useValidateLicense = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: validateLicense,
		onSuccess: (data, _licenseKey) => {
			// Update the license status in cache after successful validation
			queryClient.setQueryData(
				["licenseStatus"],
				(old: LicenseStatus | undefined) => {
					if (!old) return old;
					return {
						...old,
						isValid: data.isValid,
						error: data.error,
						lastValidated: Date.now(),
						licenseData: data.data,
					};
				},
			);
		},
	});
};

// Hook to save license (mutation)
export const useSaveLicense = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: saveLicense,
		onSuccess: (newStatus) => {
			// Update the license status in cache
			queryClient.setQueryData(["licenseStatus"], newStatus);
			// Invalidate to ensure fresh data
			queryClient.invalidateQueries({ queryKey: ["licenseStatus"] });
		},
	});
};

// Combined hook for license operations
export const useLicense = () => {
	const statusQuery = useLicenseStatus();
	const validateMutation = useValidateLicense();
	const saveMutation = useSaveLicense();

	return {
		// Status query
		status: statusQuery.data,
		isLoading: statusQuery.isLoading,
		isError: statusQuery.isError,
		error: statusQuery.error,
		refetch: statusQuery.refetch,

		// Validate mutation
		validate: validateMutation.mutate,
		validateAsync: validateMutation.mutateAsync,
		isValidating: validateMutation.isPending,
		validateError: validateMutation.error,

		// Save mutation
		save: saveMutation.mutate,
		saveAsync: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
		saveError: saveMutation.error,
		saveSuccess: saveMutation.isSuccess,
	};
};
