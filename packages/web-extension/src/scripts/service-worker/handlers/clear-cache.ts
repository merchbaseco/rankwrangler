import { ProductCache } from "@/scripts/db/product-cache";
import { ProductRequestTracker } from "@/scripts/db/product-request-tracker";
import { log } from "../../../utils/logger";
import type {
	ClearCacheMessage,
	ClearCacheResponse,
} from "../../content/types";

export async function handleClearCache(
	_message: ClearCacheMessage,
): Promise<ClearCacheResponse> {
	try {
		await Promise.all([
			ProductCache.clearCache(),
			ProductRequestTracker.clearAllRequests(),
		]);

		log.success("Extension cache cleared");

		return { success: true };
	} catch (error) {
		log.error("Failed to clear extension cache:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to clear extension cache",
		};
	}
}
