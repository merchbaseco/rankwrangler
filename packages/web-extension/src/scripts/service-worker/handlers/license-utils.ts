import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";
import type { License } from "../../types/license";

const API_BASE_URL = "https://merchbase.co/api";

export async function getCurrentLicenseStatus(): Promise<License | null> {
	const syncResult = await browser.storage.sync.get(["licenseKey"]);
	const localResult = await browser.storage.local.get(["license"]);

	const licenseKey = syncResult.licenseKey || null;
	const storedLicense = localResult.license;

	if (!licenseKey) {
		return null;
	}

	// Check if we have recent validation data (within 1 hour)
	const oneHourAgo = Date.now() - 60 * 60 * 1000;
	const isRecentValidation =
		storedLicense?.lastValidated && storedLicense.lastValidated > oneHourAgo;

	if (isRecentValidation && storedLicense.key === licenseKey) {
		return storedLicense;
	}

	// If no recent validation, return invalid license object
	return {
		key: licenseKey,
		email: storedLicense?.email || "",
		isValid: false,
		lastValidated: storedLicense?.lastValidated || 0,
		usage: storedLicense?.usage || 0,
		usageLimit: storedLicense?.usageLimit || 0,
	};
}

export async function validateLicenseKey(licenseKey: string): Promise<void> {
	try {
		const response = await fetch(`${API_BASE_URL}/license/validate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				licenseKey,
			}),
		});

		const isValid = response.ok;

		if (isValid) {
			const data = await response.json();
			// Store flat license structure
			await browser.storage.local.set({
				license: {
					key: licenseKey,
					email: data.data.email,
					isValid: true,
					lastValidated: Date.now(),
					usage: data.data.usage,
					usageLimit: data.data.usageLimit,
				},
			});
		} else {
			// Store invalid license
			await browser.storage.local.set({
				license: {
					key: licenseKey,
					email: "",
					isValid: false,
					lastValidated: Date.now(),
					usage: 0,
					usageLimit: 0,
				},
			});
		}
	} catch (error) {
		log.error("License validation failed:", error);
		// Store failed validation
		await browser.storage.local.set({
			license: {
				key: licenseKey,
				email: "",
				isValid: false,
				lastValidated: Date.now(),
				usage: 0,
				usageLimit: 0,
			},
		});
	}
}

export async function fetchFreshLicenseStatus(
	licenseKey: string,
): Promise<any | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/license/status`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${licenseKey}`,
			},
		});

		if (response.ok) {
			const data = await response.json();
			return data.data;
		}
		return null;
	} catch (error) {
		log.error("Failed to fetch license status:", error);
		return null;
	}
}
