import { browser } from "webextension-polyfill-ts";
import type {
	FetchProductInfoMessage,
	ProductInfoResponse,
} from "@/scripts/content/types";
import { log } from "../../../utils/logger";

const API_BASE_URL = "https://merchbase.co/api";

export async function handleFetchProductInfo(
	message: FetchProductInfoMessage,
): Promise<ProductInfoResponse> {
	try {
		// Get license key from storage
		const result = await browser.storage.sync.get(["licenseKey"]);

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		// Add authorization header if license key exists
		if (result.licenseKey) {
			headers.Authorization = `Bearer ${result.licenseKey}`;
		}

		const response = await fetch(`${API_BASE_URL}/getProductInfo`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				asin: message.asin,
				marketplaceId: message.marketplaceId,
			}),
		});

		if (!response.ok) {
			let errorMessage: string;

			switch (response.status) {
				case 401:
					errorMessage =
						"Invalid or missing license key. Please check your license settings.";
					break;
				case 429:
					errorMessage =
						"Daily usage limit exceeded. License will reset at midnight UTC.";
					break;
				default:
					errorMessage = `Server error (${response.status}). Please try again later.`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}

		const responseJson = await response.json();

		return {
			success: true,
			data: responseJson.data,
		};
	} catch (error) {
		log.error("ProductInfo fetch failed:", error);

		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Network error. Please check your connection.",
		};
	}
}
