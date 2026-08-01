import { describe, expect, it, mock } from "bun:test";
import { createCatalogSearchInvalidationHandlers } from "./use-catalog-search-invalidation";

const activeIdentity = {
	operationId: "11111111-1111-4111-8111-111111111111",
	queryId: "22222222-2222-4222-8222-222222222222",
};

describe("Catalog-search invalidation hook", () => {
	it("invalidates only the active Operation, query, and run list on completion", async () => {
		const invalidations = createInvalidations();
		const handlers = createCatalogSearchInvalidationHandlers({
			...activeIdentity,
			...invalidations,
		});

		await handlers.onCompleted(activeIdentity);

		expect(invalidations.invalidateOperation.mock.calls).toEqual([
			[activeIdentity.operationId],
		]);
		expect(invalidations.invalidateQuery.mock.calls).toEqual([[]]);
		expect(invalidations.invalidateRuns.mock.calls).toEqual([[]]);
	});

	it("refetches the active durable reads after reconnect", async () => {
		const invalidations = createInvalidations();
		const handlers = createCatalogSearchInvalidationHandlers({
			...activeIdentity,
			...invalidations,
		});

		await handlers.onReconnect();

		expect(invalidations.invalidateOperation.mock.calls).toHaveLength(1);
		expect(invalidations.invalidateQuery.mock.calls).toHaveLength(1);
		expect(invalidations.invalidateRuns.mock.calls).toHaveLength(1);
	});

	it("ignores completion for another Operation or query", async () => {
		const invalidations = createInvalidations();
		const handlers = createCatalogSearchInvalidationHandlers({
			...activeIdentity,
			...invalidations,
		});

		await handlers.onCompleted({
			operationId: "44444444-4444-4444-8444-444444444444",
			queryId: activeIdentity.queryId,
		});
		await handlers.onCompleted({
			operationId: activeIdentity.operationId,
			queryId: "55555555-5555-4555-8555-555555555555",
		});

		expect(invalidations.invalidateOperation.mock.calls).toHaveLength(0);
		expect(invalidations.invalidateQuery.mock.calls).toHaveLength(0);
		expect(invalidations.invalidateRuns.mock.calls).toHaveLength(0);
	});
});

const createInvalidations = () => ({
	invalidateOperation: mock(async (_operationId: string) => {}),
	invalidateQuery: mock(async () => {}),
	invalidateRuns: mock(async () => {}),
});
