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

		const response = (await apiClient.product.history.mutate({
			asin: message.asin,
			marketplaceId: message.marketplaceId,
			limit: 5000,
			days: 365,
			metrics: ["salesRank"],
		})) as PublicProductHistoryResponse;
		const salesRank = response.series.salesRank;
		const categoryId = salesRank?.category?.id ?? 0;
		const categoryName = salesRank?.category?.name ?? null;

		return {
			success: true,
			data: {
				marketplaceId: response.marketplaceId,
				asin: response.asin,
				metric: categoryName ? "bsrCategory" : "bsrMain",
				latestImportAt: null,
				categoryNames: categoryName
					? { [String(categoryId)]: categoryName }
					: {},
				points:
					salesRank?.points.map(([observedAt, value]) => ({
						categoryId,
						categoryName,
						observedAt,
						keepaMinutes: Math.floor(Date.parse(observedAt) / 60_000),
						value,
						isMissing: value === null,
					})) ?? [],
				collecting: false,
				syncTriggered: false,
			},
		};
	} catch (error) {
		const errorCode = resolveTrpcErrorCode(error);
		log.error("ProductHistory fetch failed", {
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

		return {
			success: false,
			error:
				"Unable to reach RankWrangler. Check your connection and try again.",
		};
	}
}

interface PublicProductHistoryResponse {
	marketplaceId: string;
	asin: string;
	series: {
		salesRank?: {
			category: { id: number; name: string | null } | null;
			points: [string, number | null][];
		};
	};
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
