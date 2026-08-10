import { describe, expect, it } from "bun:test";
import {
	filterProducts,
	hydrateProducts,
} from "@/components/dashboard/recent-products/filter-utils";

const baseProduct = {
	asin: "B0MERCH001",
	title: "Example shirt",
	thumbnail: { status: "unavailable" as const },
	brand: "Example",
	bullet1: null,
	bullet2: null,
	marketplaceId: "ATVPDKIKX0DER",
	rootCategoryBsr: 123_456,
	dateFirstAvailable: null,
	isMerchListing: true,
	amazonListingStatus: "active",
	facets: [],
};

describe("hydrateProducts", () => {
	it("uses the row update time for transient Amazon search rows", () => {
		const updatedAt = new Date().toISOString();

		const [product] = hydrateProducts([{ ...baseProduct, updatedAt }]);

		expect(product.updatedAt).toBe(updatedAt);
		expect(product.updatedAtMs).toBe(Date.parse(updatedAt));
	});
});

describe("filterProducts", () => {
	it("filters on the composite Product update time shown in the table", () => {
		const now = Date.now();
		const [product] = hydrateProducts([
			{
				...baseProduct,
				updatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
			},
		]);

		const result = filterProducts({
			activeFacetKeys: [],
			filters: {
				bsrRange: null,
				marketplaceIds: [],
				lastUpdated: "24h",
			},
			products: [product],
		});

		expect(result).toEqual([product]);
	});
});
