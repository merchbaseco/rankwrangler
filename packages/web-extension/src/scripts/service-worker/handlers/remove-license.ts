import type { RemoveLicenseMessage, LicenseResponse } from "../../content/types";
import { log } from '../../../utils/logger';
import { LicenseUtils } from './license-utils';

export async function handleRemoveLicense(
	message: RemoveLicenseMessage,
	sendResponse: (response: LicenseResponse) => void,
) {
	try {
		// Remove from both sync and local storage
		await chrome.storage.sync.remove(["licenseKey"]);
		await chrome.storage.local.remove(["licenseValidation"]);

		const status = await LicenseUtils.getCurrentLicenseStatus();

		sendResponse({
			success: true,
			status,
		});
	} catch (error) {
		log.error('Remove license error:', error);
		sendResponse({
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to remove license key",
		});
	}
}