import { browser } from "webextension-polyfill-ts";
import log from "@/utils/logger";
import type { ProductHistory, ProductIdentifier } from "../types/product";

export const getProductHistory = async (
	productIdentifier: ProductIdentifier
): Promise<ProductHistory | null> => {
	const { asin, marketplaceId } = productIdentifier;

	try {
		const response = await browser.runtime.sendMessage({
			type: "fetchProductHistory",
			asin,
			marketplaceId,
		});

		if (!response) {
			log.error(`getProductHistory failed for ${asin}`, {
				error: "No response from service worker.",
			});
			return null;
		}

		if (!response.success) {
			log.error(`getProductHistory failed for ${asin}`, {
				error:
					typeof response.error === "string"
						? response.error
						: "Service worker returned an unsuccessful response.",
			});
			return null;
		}

		return response.data ?? null;
	} catch (error) {
		log.error(`getProductHistory failed for ${asin}`, { error });
		return null;
	}
};
