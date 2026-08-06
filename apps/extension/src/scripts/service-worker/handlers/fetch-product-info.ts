import {
	createRankWranglerClient,
	DEFAULT_API_BASE_URL,
} from "@rankwrangler/http-client";
import type {
	FetchProductInfoMessage,
	ProductInfoResponse,
} from "@/scripts/content/types";
import { log } from "../../../utils/logger";
import { getExtensionToken } from "../extension-auth";

export async function handleFetchProductInfo(
	message: FetchProductInfoMessage
): Promise<ProductInfoResponse> {
	try {
		const sessionToken = await getExtensionToken();

		if (!sessionToken) {
			log.warn(
				"Attempting to fetch product info without an active Clerk session",
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

		const response = await apiClient.product.get.mutate({
			asin: message.asin,
			marketplaceId: message.marketplaceId,
			refresh: message.refresh ?? false,
		});
		const summary = response.summary;

		return {
			success: true,
			data: {
				asin: summary.asin ?? message.asin,
				dateFirstAvailable: summary.dateFirstAvailable ?? null,
				rootCategoryBsr: summary.rootCategoryBsr ?? null,
				rootCategoryDisplayName: summary.rootCategoryDisplayName ?? null,
				thumbnail: summary.thumbnail ?? { status: "pending" },
				freshness: {
					stale: summary.freshness?.stale ?? true,
					updatedAt: summary.freshness?.updatedAt ?? null,
				},
			},
		};
	} catch (error) {
		const errorCode = resolveTrpcErrorCode(error);
		log.error("ProductInfo fetch failed", {
			asin: message.asin,
			errorCode: errorCode ?? "UNKNOWN",
		});
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

		if (errorCode === "TIMEOUT") {
			return {
				success: false,
				error: "Product is temporarily unavailable. Retry shortly.",
			};
		}

		if (errorCode === "NOT_FOUND") {
			return {
				success: false,
				error: "Product not found.",
			};
		}

		return {
			success: false,
			error:
				"Unable to reach RankWrangler. Check your connection and try again.",
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
