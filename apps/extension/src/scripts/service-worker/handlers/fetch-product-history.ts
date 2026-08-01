import {
	createRankWranglerClient,
	DEFAULT_API_BASE_URL,
} from "@rankwrangler/http-client";
import type {
	FetchProductHistoryMessage,
	ProductHistoryResponse,
} from "@/scripts/content/types";
import { log } from "../../../utils/logger";
import { getExtensionToken } from "../extension-auth";

export async function handleFetchProductHistory(
	message: FetchProductHistoryMessage
): Promise<ProductHistoryResponse> {
	try {
		const sessionToken = await getExtensionToken();

		if (!sessionToken) {
			log.warn(
				"Attempting to fetch product history without an active Clerk session",
				{
					asin: message.asin,
				}
			);
			return {
				success: false,
				error: "Sign in to your Merchbase account to use RankWrangler.",
			};
		}

		const apiClient = createRankWranglerClient({
			baseUrl: DEFAULT_API_BASE_URL,
			headers: { Authorization: `Bearer ${sessionToken}` },
		});

		const response = await apiClient.product.getHistory.mutate({
			asin: message.asin,
			marketplaceId: message.marketplaceId,
			limit: 5000,
			days: 365,
			format: "legacy",
		});

		if (!("points" in response && "collecting" in response)) {
			throw new Error(
				"Product history returned an unsupported response format."
			);
		}

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
				error: "Your Merchbase session is not authorized for RankWrangler.",
			};
		}

		if (errorCode === "TOO_MANY_REQUESTS") {
			return {
				success: false,
				error:
					"Daily RankWrangler usage limit exceeded. Try again after reset.",
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
