import { browser } from "webextension-polyfill-ts";
import { log } from "../../../utils/logger";
import type {
	ValidateLicenseMessage,
	ValidationResponse,
} from "../../content/types";

export async function handleValidateLicense(
	message: ValidateLicenseMessage,
): Promise<ValidationResponse> {
	try {
		let licenseKey = message.licenseKey;

		// If no license key provided, get from storage
		if (!licenseKey) {
			const result = await browser.storage.sync.get(["licenseKey"]);
			licenseKey = result.licenseKey;
		}

		if (!licenseKey) {
			return {
				success: true,
				valid: false,
				error: "No license key provided",
			};
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

			return {
				success: true,
				valid: true,
				data: data.data,
			};
		} else {
			// Handle different error codes
			let error = "Invalid license key";
			if (response.status === 429) {
				error = "Daily usage limit exceeded";
			} else if (response.status === 401) {
				error = "Invalid or expired license key";
			}

			return {
				success: true,
				valid: false,
				error,
			};
		}
	} catch (error) {
		log.error("License validation error:", error);
		return {
			success: false,
			valid: false,
			error:
				error instanceof Error
					? error.message
					: "Network error during validation",
		};
	}
}
