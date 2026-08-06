import { describe, expect, it } from "bun:test";
import {
	normalizeCachedProduct,
	type CachedProductRecord,
} from "../src/scripts/db/normalize-product-cache";

describe("normalizeCachedProduct", () => {
	it("adds safe freshness to legacy cache rows", () => {
		const legacyProduct = {
			asin: "B000000001",
			marketplaceId: "ATVPDKIKX0DER",
			metadata: { success: true },
		} as CachedProductRecord;

		expect(normalizeCachedProduct(legacyProduct)).toMatchObject({
			freshness: { stale: true, updatedAt: null },
		});
	});

	it("preserves freshness on current cache rows", () => {
		const currentProduct = {
			asin: "B000000002",
			marketplaceId: "ATVPDKIKX0DER",
			metadata: { success: true },
			freshness: { stale: false, updatedAt: "2026-08-06T12:00:00.000Z" },
		} as CachedProductRecord;

		expect(normalizeCachedProduct(currentProduct).freshness).toEqual(
			currentProduct.freshness
		);
	});
});
