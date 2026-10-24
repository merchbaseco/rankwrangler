import { describe, expect, it } from "bun:test";
import { hydrateProducts } from "@/components/dashboard/recent-products/filter-utils";

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
