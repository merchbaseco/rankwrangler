import { log } from "../../../utils/logger";
import type {
	GetLicenseStatusMessage,
	LicenseResponse,
} from "../../content/types";
import { getCurrentLicenseStatus } from "./license-utils";

export async function handleGetLicenseStatus(
	_message: GetLicenseStatusMessage,
): Promise<LicenseResponse> {
	try {
		const status = await getCurrentLicenseStatus();

		return {
			success: true,
			status,
		};
	} catch (error) {
		log.error("Get license status error:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to get license status",
		};
	}
}
