import {
	createRankWranglerClient,
	DEFAULT_API_BASE_URL,
} from "@rankwrangler/http-client";
import type {
	FetchProductHistoryMessage,
	ProductHistoryResponse,
} from "@/scripts/content/types";
import { log } from "../../../utils/logger";
import { resolveStoredLicenseKey } from "./license-utils";

export async function handleFetchProductHistory(
	message: FetchProductHistoryMessage
): Promise<ProductHistoryResponse> {
	try {
		const activeLicenseKey = await resolveStoredLicenseKey();

		if (!activeLicenseKey) {
			log.warn(
				"Attempting to fetch product history without an active license key",
				{
					asin: message.asin,
				}
			);
			return {
				success: false,
				error:
					"Invalid or missing license key. Please check your license settings.",
			};
		}

		const apiClient = createRankWranglerClient({
			baseUrl: DEFAULT_API_BASE_URL,
			apiKey: activeLicenseKey,
		});

		const response = await apiClient.getProductHistory.mutate({
			asin: message.asin,
			marketplaceId: message.marketplaceId,
			limit: 5000,
			days: 365,
		});

		return {
			success: true,
			data: response,
		};
	} catch (error) {
		log.error("ProductHistory fetch failed:", error);

		const errorCode = resolveTrpcErrorCode(error);
		if (errorCode === "UNAUTHORIZED") {
			return {
				success: false,
				error:
					"Invalid or missing license key. Please check your license settings.",
			};
		}

		if (errorCode === "TOO_MANY_REQUESTS") {
			return {
				success: false,
				error:
					"Daily usage limit exceeded. License will reset at midnight UTC.",
			};
		}

		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Network error. Please check your connection.",
		};
	}
}

const resolveTrpcErrorCode = (error: unknown): string | null => {
	if (!error || typeof error !== "object") {
		return null;
	}

	if ("data" in error) {
		const data = (error as { data?: { code?: string } }).data;
		if (data?.code) {
			return data.code;
		}
	}

	return null;
};
