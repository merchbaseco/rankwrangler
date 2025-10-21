import { RateLimiter } from "limiter";
import { browser } from "webextension-polyfill-ts";
import log from "@/utils/logger";
import { ProductCache } from "../db/product-cache";
import { ProductRequestTracker } from "../db/product-request-tracker";
import {
	getErrorProduct,
	type Product,
	type ProductIdentifier,
} from "../types/product";

const rateLimiter = new RateLimiter({
	tokensPerInterval: 10,
	interval: "second",
});

export const getProduct = async (
	productIdentifier: ProductIdentifier,
): Promise<Product> => {
	const { asin, marketplaceId } = productIdentifier;

	await ProductRequestTracker.markRequestStarted(productIdentifier);
	await rateLimiter.removeTokens(1);

	try {
		const message = {
			type: "fetchProductInfo",
			asin,
			marketplaceId,
		};

		const response = await browser.runtime.sendMessage(message);

		if (!response) {
			log.error(`getProduct failed for ${asin}`, {
				error: "No response from service worker.",
			});
			return getErrorProduct(productIdentifier);
		}

		if (!response.success) {
			log.error(`getProduct failed for ${asin}`, {
				error: `Service worker encountered error. ${response.error}`,
			});
			return getErrorProduct(productIdentifier);
		}

		const responseData = response.data ?? {};
		const displayGroupRanks = Array.isArray(responseData.displayGroupRanks)
			? responseData.displayGroupRanks
			: [];
		const classificationRanks = Array.isArray(responseData.classificationRanks)
			? responseData.classificationRanks
			: [];

		if (typeof responseData.marketplaceId !== "string") {
			log.error(`getProduct failed for ${asin}`, {
				error: "Response missing marketplaceId",
				raw: responseData,
			});
			return getErrorProduct(productIdentifier);
		}

		const product: Product = {
			asin,
			marketplaceId: responseData.marketplaceId,
			...(typeof responseData.creationDate === "string"
				? { creationDate: responseData.creationDate }
				: {}),
			...(typeof responseData.bsr === "number"
				? { bsr: responseData.bsr }
				: {}),
			...(typeof responseData.bsrCategory === "string"
				? { bsrCategory: responseData.bsrCategory }
				: {}),
			displayGroupRanks,
			classificationRanks,
			metadata: {
				success: true,
				lastFetched:
					responseData.metadata?.lastFetched || new Date().toISOString(),
				cached: Boolean(responseData.metadata?.cached),
			},
		};

		// Cache the successful response
		await ProductCache.set(product);
		return product;
	} catch (error) {
		log.error(`getProduct failed for ${asin}`, { error });
		return getErrorProduct(productIdentifier);
	} finally {
		// Always mark request as completed, regardless of success or failure
		try {
			await ProductRequestTracker.markRequestCompleted(productIdentifier);
		} catch (cleanupError) {
			log.error(`Failed to mark request completed for ${asin}:`, cleanupError);
		}
	}
};
