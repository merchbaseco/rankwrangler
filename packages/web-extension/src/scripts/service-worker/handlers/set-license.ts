import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";
import type { LicenseResponse, SetLicenseMessage } from "../../content/types";
import { getCurrentLicenseStatus, validateLicenseKey } from "./license-utils";

export async function handleSetLicense(
	message: SetLicenseMessage,
): Promise<LicenseResponse> {
	try {
		const { licenseKey } = message;

		if (!licenseKey || licenseKey.trim().length === 0) {
			return {
				success: false,
				error: "License key cannot be empty",
			};
		}

		// Save to sync storage
		await browser.storage.sync.set({ licenseKey: licenseKey.trim() });

		// Clear any previous validation cache
		await browser.storage.local.remove(["licenseValidation"]);

		// Validate the new license
		await validateLicenseKey(licenseKey.trim());

		const status = await getCurrentLicenseStatus();

		return {
			success: true,
			status,
		};
	} catch (error) {
		log.error("Set license error:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to save license key",
		};
	}
}
