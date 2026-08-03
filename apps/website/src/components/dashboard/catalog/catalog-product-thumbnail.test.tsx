import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	AvailableCatalogProductThumbnail,
	PendingCatalogProductThumbnail,
	UnavailableCatalogProductThumbnail,
} from "./catalog-product-thumbnail";

describe("Catalog Product thumbnail", () => {
	it("renders an explicit SP-API pending spinner", () => {
		const markup = renderToStaticMarkup(<PendingCatalogProductThumbnail />);

		expect(markup).toContain("Loading Amazon listing data");
		expect(markup).toContain("animate-spin");
		expect(markup).not.toContain("N/A");
	});

	it("renders the Amazon thumbnail once available", () => {
		const markup = renderToStaticMarkup(
			<AvailableCatalogProductThumbnail
				asin="B012345678"
				title="Example shirt"
				url="https://example.com/product.jpg"
			/>,
		);

		expect(markup).toContain('src="https://example.com/product.jpg"');
		expect(markup).toContain('alt="Example shirt"');
	});

	it("renders a distinct unavailable state after enrichment completes", () => {
		const markup = renderToStaticMarkup(
			<UnavailableCatalogProductThumbnail />,
		);

		expect(markup).toContain("Amazon listing has no thumbnail");
		expect(markup).not.toContain("animate-spin");
	});
});
