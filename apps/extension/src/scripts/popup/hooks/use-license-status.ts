import { useQuery } from "@tanstack/react-query";
import { browser } from "webextension-polyfill-ts";
import z from "zod";
import { LicenseSchema } from "@/scripts/types/license";

const fetchLicenseStatus = async () => {
	const rawLicenseResponse = await browser.runtime.sendMessage({
		type: "getLicenseStatus",
	});

	const licenseResponseSchema = z.object({
		success: z.boolean(),
		error: z.string().optional(),
		license: LicenseSchema.nullable().optional(),
	});

	const licenseResponse = licenseResponseSchema.safeParse(rawLicenseResponse);

	if (!licenseResponse.success) {
		throw new Error(licenseResponse.error.message);
	}

	if (!licenseResponse.data.success) {
		throw new Error(
			licenseResponse.data.error || "Failed to get license status"
		);
	}

	return licenseResponse.data.license;
};

export const useLicenseStatus = () => {
	const {
		data: license,
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["licenseStatus"],
		queryFn: fetchLicenseStatus,
		staleTime: 0,
		refetchOnMount: "always",
		refetchOnReconnect: "always",
		refetchOnWindowFocus: false,
		retry: 1,
	});

	return {
		license,
		isLoading,
		isError,
		error,
		refetch,
	};
};
