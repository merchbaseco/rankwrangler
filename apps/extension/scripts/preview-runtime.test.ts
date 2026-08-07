import { describe, expect, test } from "bun:test";
import { browser } from "../src/scripts/preview/mock-webextension-polyfill";

describe("extension preview runtime", () => {
	test("returns Product history for the preview detail surface", async () => {
		const response = await browser.runtime.sendMessage({
			type: "fetchProductHistory",
			asin: "B0D2YQ9ABC",
			marketplaceId: "ATVPDKIKX0DER",
		});

		expect(response).toMatchObject({
			success: true,
			data: {
				asin: "B0D2YQ9ABC",
				marketplaceId: "ATVPDKIKX0DER",
				metric: "bsrMain",
				collecting: false,
				syncTriggered: false,
			},
		});
		expect(response.data.points.length).toBeGreaterThan(1);
		expect(
			Date.now() - Date.parse(response.data.points.at(-1)?.observedAt ?? "")
		).toBeLessThan(2 * 24 * 60 * 60 * 1000);
	});
});
