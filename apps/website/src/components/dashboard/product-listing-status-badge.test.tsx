import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductListingStatusBadge } from "@/components/dashboard/product-listing-status-badge";

describe("ProductListingStatusBadge", () => {
	it("labels Products Amazon no longer returns without hiding their row", () => {
		const markup = renderToStaticMarkup(
			<ProductListingStatusBadge amazonListingStatus="deleted" />,
		);

		expect(markup).toContain("Deleted from Amazon");
	});

	it("renders nothing for active Amazon listings", () => {
		expect(
			renderToStaticMarkup(
				<ProductListingStatusBadge amazonListingStatus="active" />,
			),
		).toBe("");
	});
});
