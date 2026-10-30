import { describe, expect, it } from "bun:test";
import {
	createWebsiteTrpcRuntime,
	isSubscriptionOperation,
	resolveTrpcWebsocketUrl,
} from "./trpc-client";

describe("website tRPC transport", () => {
	it("routes only subscriptions through WebSockets", () => {
		expect(isSubscriptionOperation({ type: "subscription" })).toBe(true);
		expect(isSubscriptionOperation({ type: "query" })).toBe(false);
		expect(isSubscriptionOperation({ type: "mutation" })).toBe(false);
	});

	it("uses the tRPC WebSocket endpoint for HTTP and HTTPS origins", () => {
		expect(resolveTrpcWebsocketUrl("http://localhost:8080")).toBe(
			"ws://localhost:8080/api/trpc",
		);
		expect(resolveTrpcWebsocketUrl("https://rankwrangler.example")).toBe(
			"wss://rankwrangler.example/api/trpc",
		);
	});

	it("constructs the client without opening a Strict Mode orphan socket", async () => {
		const runtime = createWebsiteTrpcRuntime({
			baseUrl: "http://localhost:8080",
		});

		expect(runtime.wsClient.connectionState.get().state).toBe("idle");
		await runtime.wsClient.close();
	});
});
