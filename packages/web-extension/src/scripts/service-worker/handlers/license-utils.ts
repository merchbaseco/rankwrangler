import { log } from '../../../utils/logger';

export interface LicenseStatus {
	isValid: boolean;
	licenseKey: string | null;
	lastValidated?: number;
	error?: string;
	licenseData?: any;
}

export class LicenseUtils {
	private static readonly API_BASE_URL = "https://merchbase.co/api";

	static async getCurrentLicenseStatus(): Promise<LicenseStatus> {
		const syncResult = await chrome.storage.sync.get(["licenseKey"]);
		const localResult = await chrome.storage.local.get(["licenseValidation"]);

		const licenseKey = syncResult.licenseKey || null;
		const validation = localResult.licenseValidation;

		if (!licenseKey) {
			return {
				isValid: false,
				licenseKey: null,
			};
		}

		// Check if we have recent validation data (within 1 hour)
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		const isRecentValidation =
			validation &&
			validation.lastValidated &&
			validation.lastValidated > oneHourAgo;

		if (isRecentValidation && validation.licenseKey === licenseKey) {
			return {
				isValid: validation.isValid,
				licenseKey,
				lastValidated: validation.lastValidated,
				error: validation.error,
				licenseData: validation.licenseData,
			};
		}

		// If no recent validation, we need to check
		return {
			isValid: false, // Unknown until validated
			licenseKey,
			error: "License needs validation",
		};
	}

	static async validateLicenseKey(licenseKey: string): Promise<void> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/license/validate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					licenseKey,
				}),
			});

			const isValid = response.ok;
			let licenseData = null;

			if (isValid) {
				const data = await response.json();
				licenseData = data.data;
			}

			await chrome.storage.local.set({
				licenseValidation: {
					isValid,
					lastValidated: Date.now(),
					licenseKey,
					licenseData,
				},
			});
		} catch (error) {
			log.error('License validation failed:', error);
			// Store failed validation
			await chrome.storage.local.set({
				licenseValidation: {
					isValid: false,
					lastValidated: Date.now(),
					licenseKey,
					error: "Validation failed",
				},
			});
		}
	}

	static async fetchFreshLicenseStatus(licenseKey: string): Promise<any | null> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/license/status`, {
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
			log.error('Failed to fetch license status:', error);
			return null;
		}
	}
}