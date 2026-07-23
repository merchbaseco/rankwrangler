import { describe, expect, it } from "bun:test";
import {
	filterProducts,
	hydrateProducts,
} from "@/components/dashboard/recent-products/filter-utils";

const baseProduct = {
	asin: "B0MERCH001",
	title: "Example shirt",
	thumbnailUrl: null,
	brand: "Example",
	bullet1: null,
	bullet2: null,
	marketplaceId: "ATVPDKIKX0DER",
	rootCategoryBsr: 123_456,
	dateFirstAvailable: null,
	isMerchListing: true,
	facets: [],
};

describe("hydrateProducts", () => {
	it("uses SP-API freshness as the update time for transient Amazon search rows", () => {
		const spApiFetchedAt = new Date().toISOString();

		const [product] = hydrateProducts([{ ...baseProduct, spApiFetchedAt }]);

		expect(product.updatedAt).toBe(spApiFetchedAt);
		expect(product.updatedAtMs).toBe(Date.parse(spApiFetchedAt));
	});
});

describe("filterProducts", () => {
	it("filters on the composite Product update time shown in the table", () => {
		const now = Date.now();
		const [product] = hydrateProducts([
			{
				...baseProduct,
				spApiFetchedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
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
