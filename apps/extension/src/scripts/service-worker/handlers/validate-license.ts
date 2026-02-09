import { log } from "../../../utils/logger";
import type {
	ValidateLicenseMessage,
	ValidationResponse,
} from "../../content/types";
import { resolveStoredLicenseKey, validateLicenseKey } from "./license-utils";

export async function handleValidateLicense(
	message: ValidateLicenseMessage,
): Promise<ValidationResponse> {
	try {
		const licenseKey = await resolveStoredLicenseKey(message.licenseKey);

		if (!licenseKey) {
			log.warn("License validation requested without a stored license key");
			return {
				success: true,
				valid: false,
				error: "No license key provided",
			};
		}

		const validation = await validateLicenseKey(licenseKey);

		log.info("License validation completed", {
			isValid: validation.isValid,
			hasError: !!validation.error,
			status: validation.status,
			networkError: validation.networkError,
		});

		const response: ValidationResponse = {
			success: !validation.networkError,
			valid: validation.isValid,
		};

		if (validation.error) {
			response.error = validation.error;
		}

		if (validation.isValid) {
			response.data = {
				email: validation.license.email,
				usage: validation.license.usage,
				usageLimit: validation.license.usageLimit,
			};
		}

		return response;
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
