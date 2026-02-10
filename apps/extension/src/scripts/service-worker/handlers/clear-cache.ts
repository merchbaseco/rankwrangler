import { browser } from "webextension-polyfill-ts";
import { ProductCache } from "@/scripts/db/product-cache";
import { ProductRequestTracker } from "@/scripts/db/product-request-tracker";
import { log } from "../../../utils/logger";
import type {
	CacheClearedNotification,
	ClearCacheMessage,
	ClearCacheResponse,
} from "../../content/types";

export async function handleClearCache(
	_message: ClearCacheMessage
): Promise<ClearCacheResponse> {
	try {
		await Promise.all([
			ProductCache.clearCache(),
			ProductRequestTracker.clearAllRequests(),
		]);

		const [cacheSize, queueCount] = await Promise.all([
			ProductCache.getCacheSize(),
			ProductRequestTracker.getRequestsInProgressCount(),
		]);

		await notifyTabsCacheCleared({
			type: "cacheCleared",
			cacheSize,
			queueCount,
		});

		log.success("Extension cache cleared");

		return { success: true, cacheSize, queueCount };
	} catch (error: unknown) {
		log.error("Failed to clear extension cache:", { error });
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to clear extension cache",
		};
	}
}

async function notifyTabsCacheCleared(
	message: CacheClearedNotification
): Promise<void> {
	try {
		const tabs = await browser.tabs.query({});

		await Promise.all(
			tabs
				.filter((tab) => tab.id !== undefined)
				.map(async (tab) => {
					try {
						if (tab.id === undefined) {
							return;
						}
						await browser.tabs.sendMessage(tab.id, message);
					} catch (error: unknown) {
						log.debug("Unable to notify tab about cleared cache", {
							tabId: tab.id,
							error,
						});
					}
				})
		);
	} catch (error) {
		log.warn("Failed to broadcast cache cleared notification", { error });
	}
}
