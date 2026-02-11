import type { ProductIdentifier } from "../types/product";
import { db, type ProductRequestTableSchema } from "./index";

export async function markRequestStarted(
	productIdentifier: ProductIdentifier
): Promise<void> {
	await db.productRequests.put({
		asin: productIdentifier.asin,
		marketplaceId: productIdentifier.marketplaceId,
		startedAt: new Date().toISOString(),
	});
}

export async function markRequestCompleted(
	productIdentifier: ProductIdentifier
): Promise<void> {
	await db.productRequests.delete([
		productIdentifier.asin,
		productIdentifier.marketplaceId,
	]);
}

export async function getRequestsInProgressCount(): Promise<number> {
	return await db.productRequests.count();
}

export async function getRequestsInProgress(
	limit = 50
): Promise<ProductRequestTableSchema[]> {
	const requests = await db.productRequests.toArray();

	return requests
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
		.slice(0, Math.max(0, limit));
}

export async function clearAllRequests(): Promise<void> {
	await db.productRequests.clear();
}

export const ProductRequestTracker = {
	markRequestStarted,
	markRequestCompleted,
	getRequestsInProgressCount,
	getRequestsInProgress,
	clearAllRequests,
};
