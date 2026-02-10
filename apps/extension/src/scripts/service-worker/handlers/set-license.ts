import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";
import type { LicenseResponse, SetLicenseMessage } from "../../content/types";
import { validateLicenseKey } from "./license-utils";

export async function handleSetLicense(
	message: SetLicenseMessage
): Promise<LicenseResponse> {
	try {
		const { licenseKey } = message;

		if (!licenseKey || licenseKey.trim().length === 0) {
			return {
				success: false,
				error: "License key cannot be empty",
			};
		}

		const trimmedKey = licenseKey.trim();

		// Validate the new license before persisting it
		const validation = await validateLicenseKey(trimmedKey);

		if (!validation.isValid) {
			// Remove stored key if validation definitively failed
			if (validation.status === 401) {
				await browser.storage.sync.remove(["licenseKey"]);
			}

			return {
				success: false,
				error: validation.error || "Invalid license key",
				license: validation.license,
			};
		}

		// Persist the validated key for future sessions
		await browser.storage.sync.set({ licenseKey: trimmedKey });

		return {
			success: true,
			license: validation.license,
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
