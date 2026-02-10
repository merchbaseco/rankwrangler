import type { ProductIdentifier } from "../types/product";
import { db } from "./index";

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

export async function clearAllRequests(): Promise<void> {
	await db.productRequests.clear();
}

export const ProductRequestTracker = {
	markRequestStarted,
	markRequestCompleted,
	getRequestsInProgressCount,
	clearAllRequests,
};
