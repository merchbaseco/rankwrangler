import { describe, expect, it } from "bun:test";
import {
	getCatalogOperationPollingInterval,
	isCatalogRunReadPending,
	readCatalogSession,
	resolveCatalogQuerySwitch,
	writeCatalogSession,
} from "./catalog-search-state";

describe("Catalog search durable state", () => {
	it("polls pending Operations using the server retry hint", () => {
		expect(
			getCatalogOperationPollingInterval({
				status: "pending",
				retryAfterSeconds: 2,
			}),
		).toBe(2_000);
		expect(getCatalogOperationPollingInterval({ status: "completed" })).toBe(
			false,
		);
		expect(getCatalogOperationPollingInterval(undefined, true)).toBe(2_000);
	});

	it("round-trips the active query and pending Operation through the URL", () => {
		const url = new URL("http://localhost:5173/?page=catalog");
		writeCatalogSession(url, {
			term: "retro gardening shirt",
			operationId: "11111111-1111-4111-8111-111111111111",
			queryId: "22222222-2222-4222-8222-222222222222",
		});

		expect(readCatalogSession(url)).toEqual({
			term: "retro gardening shirt",
			operationId: "11111111-1111-4111-8111-111111111111",
			queryId: "22222222-2222-4222-8222-222222222222",
		});
	});

	it("rejects a pending Operation without its durable query identity", () => {
		const url = new URL(
			"http://localhost:5173/?page=catalog&catalogTerm=one&catalogOperation=11111111-1111-4111-8111-111111111111",
		);

		expect(readCatalogSession(url)).toEqual({
			term: "one",
			operationId: null,
			queryId: null,
		});
	});

	it("drops Operation and run selection when the query changes", () => {
		expect(
			resolveCatalogQuerySwitch(
				{
					term: "retro gardening shirt",
					operationId: "11111111-1111-4111-8111-111111111111",
					queryId: "22222222-2222-4222-8222-222222222222",
					selectedRunId: "33333333-3333-4333-8333-333333333333",
				},
				"vintage cat shirt",
			),
		).toEqual({
			term: "vintage cat shirt",
			operationId: null,
			queryId: null,
			selectedRunId: null,
		});
	});

	it("stops showing pending when the terminal run read fails", () => {
		expect(
			isCatalogRunReadPending({
				hasOperation: true,
				hasRunReadError: true,
				hasSelectedRun: false,
				operationHasResource: true,
				operationStatus: "completed",
			}),
		).toBe(false);
	});
});
