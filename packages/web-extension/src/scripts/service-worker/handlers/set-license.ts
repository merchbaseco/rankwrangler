import type { SetLicenseMessage, LicenseResponse } from "../../content/types";
import { log } from '../../../utils/logger';
import { LicenseUtils } from './license-utils';

export async function handleSetLicense(
	message: SetLicenseMessage,
	sendResponse: (response: LicenseResponse) => void,
) {
	try {
		const { licenseKey } = message;

		if (!licenseKey || licenseKey.trim().length === 0) {
			sendResponse({
				success: false,
				error: "License key cannot be empty",
			});
			return;
		}

		// Save to sync storage
		await chrome.storage.sync.set({ licenseKey: licenseKey.trim() });

		// Clear any previous validation cache
		await chrome.storage.local.remove(["licenseValidation"]);

		// Validate the new license
		await LicenseUtils.validateLicenseKey(licenseKey.trim());

		const status = await LicenseUtils.getCurrentLicenseStatus();

		sendResponse({
			success: true,
			status,
		});
	} catch (error) {
		log.error('Set license error:', error);
		sendResponse({
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to save license key",
		});
	}
}