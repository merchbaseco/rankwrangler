import { describe, expect, it, mock } from "bun:test";
import {
	createProductSyncInvalidationHandlers,
	type ProductSyncIdentity,
} from "./use-product-sync-invalidation";

const marketplaceId = "ATVPDKIKX0DER";
const firstProduct = { marketplaceId, asin: "B000000001" };
const secondProduct = { marketplaceId, asin: "B000000002" };

describe("Product-sync invalidation hook", () => {
	it("invalidates only the Product identified by the completion event", async () => {
		const invalidateProduct = mock(async (_identity: ProductSyncIdentity) => {});
		const handlers = createProductSyncInvalidationHandlers({
			marketplaceId,
			pendingProducts: [firstProduct, secondProduct],
			invalidateProduct,
		});

		await handlers.onCompleted(secondProduct);

		expect(invalidateProduct.mock.calls).toEqual([[secondProduct]]);
	});

	it("ignores completion from another marketplace", async () => {
		const invalidateProduct = mock(async (_identity: ProductSyncIdentity) => {});
		const handlers = createProductSyncInvalidationHandlers({
			marketplaceId,
			pendingProducts: [firstProduct],
			invalidateProduct,
		});

		await handlers.onCompleted({
			marketplaceId: "A1F83G8C2ARO7P",
			asin: firstProduct.asin,
		});

		expect(invalidateProduct.mock.calls).toHaveLength(0);
	});

	it("recovers missed events by invalidating only pending visible Products", async () => {
		const invalidateProduct = mock(async (_identity: ProductSyncIdentity) => {});
		const handlers = createProductSyncInvalidationHandlers({
			marketplaceId,
			pendingProducts: [firstProduct, secondProduct],
			invalidateProduct,
		});

		await handlers.onReconnect();

		expect(invalidateProduct.mock.calls).toEqual([
			[firstProduct],
			[secondProduct],
		]);
	});
});
