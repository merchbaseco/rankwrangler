import type { ValidateLicenseMessage, ValidationResponse } from "../../content/types";
import { log } from '../../../utils/logger';
import { LicenseUtils } from './license-utils';

export async function handleValidateLicense(
	message: ValidateLicenseMessage,
	sendResponse: (response: ValidationResponse) => void,
) {
	try {
		let licenseKey = message.licenseKey;

		// If no license key provided, get from storage
		if (!licenseKey) {
			const result = await chrome.storage.sync.get(["licenseKey"]);
			licenseKey = result.licenseKey;
		}

		if (!licenseKey) {
			sendResponse({
				success: true,
				valid: false,
				error: "No license key provided",
			});
			return;
		}

		// Validate against API using dedicated validation endpoint
		const response = await fetch("https://merchbase.co/api/license/validate", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				licenseKey,
			}),
		});

		if (response.ok) {
			const data = await response.json();

			// Store validation result with timestamp and license data
			await chrome.storage.local.set({
				licenseValidation: {
					isValid: true,
					lastValidated: Date.now(),
					licenseKey,
					licenseData: data.data, // Store license info from server
				},
			});

			sendResponse({
				success: true,
				valid: true,
				data: data.data,
			});
		} else {
			// Handle different error codes
			let error = "Invalid license key";
			if (response.status === 429) {
				error = "Daily usage limit exceeded";
			} else if (response.status === 401) {
				error = "Invalid or expired license key";
			}

			sendResponse({
				success: true,
				valid: false,
				error,
			});
		}
	} catch (error) {
		log.error('License validation error:', error);
		sendResponse({
			success: false,
			valid: false,
			error:
				error instanceof Error
					? error.message
					: "Network error during validation",
		});
	}
}