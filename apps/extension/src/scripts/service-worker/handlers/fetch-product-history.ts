import {
	createRankWranglerClient,
	DEFAULT_API_BASE_URL,
} from "@rankwrangler/http-client";
import type {
	FetchProductHistoryMessage,
	ProductHistory,
	ProductHistoryPoint,
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

		if (!isTransparentProductHistoryResponse(response)) {
			throw new Error(
				"Product history returned an unsupported response format."
			);
		}

		return {
			success: true,
			data: {
				marketplaceId: response.marketplaceId,
				asin: response.asin,
				metric: response.metric,
				latestImportAt: response.freshness.updatedAt,
				categoryNames: response.categoryNames,
				points: response.points,
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

interface TransparentProductHistoryResponse {
	marketplaceId: string;
	asin: string;
	metric: ProductHistory["metric"];
	categoryNames: Record<string, string>;
	points: ProductHistoryPoint[];
	freshness: {
		stale: boolean;
		updatedAt: string | null;
	};
}

const isTransparentProductHistoryResponse = (
	value: unknown
): value is TransparentProductHistoryResponse => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.marketplaceId === "string" &&
		typeof value.asin === "string" &&
		isProductHistoryMetric(value.metric) &&
		isStringRecord(value.categoryNames) &&
		Array.isArray(value.points) &&
		value.points.every(isProductHistoryPoint) &&
		isFreshness(value.freshness)
	);
};

const isProductHistoryMetric = (
	value: unknown
): value is ProductHistory["metric"] =>
	["bsrMain", "bsrCategory", "priceAmazon", "priceNew", "priceNewFba"].includes(
		value as ProductHistory["metric"]
	);

const isProductHistoryPoint = (
	value: unknown
): value is ProductHistoryPoint => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.categoryId === "number" &&
		(typeof value.categoryName === "string" || value.categoryName === null) &&
		typeof value.observedAt === "string" &&
		typeof value.keepaMinutes === "number" &&
		(typeof value.value === "number" || value.value === null) &&
		typeof value.isMissing === "boolean"
	);
};

const isFreshness = (
	value: unknown
): value is TransparentProductHistoryResponse["freshness"] =>
	isRecord(value) &&
	typeof value.stale === "boolean" &&
	(typeof value.updatedAt === "string" || value.updatedAt === null);

const isStringRecord = (value: unknown): value is Record<string, string> =>
	isRecord(value) &&
	Object.values(value).every((item) => typeof item === "string");

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;
