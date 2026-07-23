import { describe, expect, it, mock } from "bun:test";
import { createProductHistoryRefreshInvalidationHandlers } from "./use-product-history-refresh-invalidation";

const activeIdentity = {
	operationId: "11111111-1111-4111-8111-111111111111",
	marketplaceId: "ATVPDKIKX0DER",
	asin: "B012345678",
};

describe("Product-history refresh invalidation hook", () => {
	it("invalidates the active Operation and Product-history reads on completion", async () => {
		const invalidations = createInvalidations();
		const handlers = createProductHistoryRefreshInvalidationHandlers({
			...activeIdentity,
			...invalidations,
		});

		await handlers.onCompleted(activeIdentity);

		expect(invalidations.invalidateOperation.mock.calls).toEqual([
			[activeIdentity.operationId],
		]);
		expect(invalidations.invalidateHistory.mock.calls).toEqual([[]]);
	});

	it("invalidates active durable reads after reconnect", async () => {
		const invalidations = createInvalidations();
		const handlers = createProductHistoryRefreshInvalidationHandlers({
			...activeIdentity,
			...invalidations,
		});

		await handlers.onReconnect();

		expect(invalidations.invalidateOperation.mock.calls).toEqual([
			[activeIdentity.operationId],
		]);
		expect(invalidations.invalidateHistory.mock.calls).toEqual([[]]);
	});

	it("ignores completion from a stale Operation", async () => {
		const invalidations = createInvalidations();
		const handlers = createProductHistoryRefreshInvalidationHandlers({
			...activeIdentity,
			...invalidations,
		});

		await handlers.onCompleted({
			...activeIdentity,
			operationId: "22222222-2222-4222-8222-222222222222",
		});

		expect(invalidations.invalidateOperation.mock.calls).toHaveLength(0);
		expect(invalidations.invalidateHistory.mock.calls).toHaveLength(0);
	});
});

const createInvalidations = () => ({
	invalidateOperation: mock(async (_operationId: string) => {}),
	invalidateHistory: mock(async () => {}),
});
