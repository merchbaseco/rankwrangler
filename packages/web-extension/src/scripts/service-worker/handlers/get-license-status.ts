import type { GetLicenseStatusMessage, LicenseResponse } from "../../content/types";
import { log } from '../../../utils/logger';
import { LicenseUtils } from './license-utils';

export async function handleGetLicenseStatus(
	message: GetLicenseStatusMessage,
	sendResponse: (response: LicenseResponse) => void,
) {
	try {
		const status = await LicenseUtils.getCurrentLicenseStatus();

		sendResponse({
			success: true,
			status,
		});
	} catch (error) {
		log.error('Get license status error:', error);
		sendResponse({
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to get license status",
		});
	}
}