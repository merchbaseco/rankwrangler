import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";
import type {
	LicenseResponse,
	RemoveLicenseMessage,
} from "../../content/types";
import { getCurrentLicenseStatus } from "./license-utils";

export async function handleRemoveLicense(
	_message: RemoveLicenseMessage,
): Promise<LicenseResponse> {
	try {
		// Remove from both sync and local storage
		await browser.storage.sync.remove(["licenseKey"]);
		await browser.storage.local.remove(["licenseValidation"]);

		const status = await getCurrentLicenseStatus();

		return {
			success: true,
			status,
		};
	} catch (error) {
		log.error("Remove license error:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to remove license key",
		};
	}
}
