import { describe, expect, it } from "bun:test";
import { getProductHistoryOperationPollingInterval } from "./product-history-operation-polling";

describe("Product-history Operation polling fallback", () => {
	it("uses the durable retry hint while pending", () => {
		expect(
			getProductHistoryOperationPollingInterval({
				id: "11111111-1111-4111-8111-111111111111",
				status: "pending",
				retryAfterSeconds: 2,
			}),
		).toBe(2_000);
	});

	it("stops polling after either terminal outcome", () => {
		expect(
			getProductHistoryOperationPollingInterval({
				id: "11111111-1111-4111-8111-111111111111",
				status: "completed",
				resource: null,
				error: {
					code: "PROVIDER_UNAVAILABLE",
					message: "Product history collection failed.",
				},
			}),
		).toBe(false);
	});
});
