import { RateLimiter } from "limiter";
import { browser } from "webextension-polyfill-ts";
import log from "@/utils/logger";
import {
	finishProductRequestTrace,
	startProductRequestTrace,
} from "../content/debug/debug-snapshot";
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
	productIdentifier: ProductIdentifier
): Promise<Product> => {
	const { asin, marketplaceId } = productIdentifier;
	const requestTrace = startProductRequestTrace(productIdentifier);
	let requestCompletion: {
		status: "success" | "error" | "no_response";
		response?: unknown;
		errorMessage?: string;
	} = {
		status: "error",
		errorMessage: "Request did not complete.",
	};

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
			requestCompletion = {
				status: "no_response",
				response: null,
				errorMessage: "No response from service worker.",
			};
			log.error(`getProduct failed for ${asin}`, {
				error: "No response from service worker.",
			});
			return getErrorProduct(productIdentifier);
		}

		if (!response.success) {
			requestCompletion = {
				status: "error",
				response,
				errorMessage:
					typeof response.error === "string"
						? response.error
						: "Service worker returned an unsuccessful response.",
			};
			log.error(`getProduct failed for ${asin}`, {
				error: `Service worker encountered error. ${response.error}`,
			});
			return getErrorProduct(productIdentifier);
		}

		const responseData = response.data ?? {};

		const product: Product = {
			asin,
			marketplaceId,
			...(typeof responseData.dateFirstAvailable === "string" &&
			responseData.dateFirstAvailable !== null &&
			responseData.dateFirstAvailable !== ""
				? { creationDate: responseData.dateFirstAvailable }
				: {}),
			...(typeof responseData.rootCategoryBsr === "number" ||
			responseData.rootCategoryBsr === null
				? { rootCategoryBsr: responseData.rootCategoryBsr }
				: {}),
			...(typeof responseData.rootCategoryDisplayName === "string" ||
			responseData.rootCategoryDisplayName === null
				? { rootCategoryDisplayName: responseData.rootCategoryDisplayName }
				: {}),
			metadata: {
				success: true,
				lastFetched:
					responseData.metadata?.lastFetched || new Date().toISOString(),
				cached: Boolean(responseData.metadata?.cached),
			},
		};

		// Cache write failures should not block rendering live product data.
		try {
			await ProductCache.set(product);
		} catch (cacheError) {
			log.warn(`Failed to cache product for ${asin}; returning live data`, {
				error: cacheError,
			});
		}
		requestCompletion = {
			status: "success",
			response,
		};
		return product;
	} catch (error) {
		requestCompletion = {
			status: "error",
			errorMessage:
				error instanceof Error
					? error.message
					: "Unexpected error during getProduct.",
			response: error,
		};
		log.error(`getProduct failed for ${asin}`, { error });
		return getErrorProduct(productIdentifier);
	} finally {
		// Always mark request as completed, regardless of success or failure
		try {
			await ProductRequestTracker.markRequestCompleted(productIdentifier);
		} catch (cleanupError) {
			log.error(`Failed to mark request completed for ${asin}:`, cleanupError);
		}

		finishProductRequestTrace(requestTrace, requestCompletion);
	}
};
