import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductThumbnail } from "@/components/dashboard/product-thumbnail";

describe("Product thumbnail", () => {
	it("renders an explicit pending thumbnail spinner", () => {
		const markup = renderToStaticMarkup(
			<ProductThumbnail
				asin="B012345678"
				thumbnail={{ status: "pending" }}
				title="Example shirt"
			/>,
		);

		expect(markup).toContain("Loading product thumbnail");
		expect(markup).toContain("animate-spin");
		expect(markup).not.toContain("N/A");
	});

	it("renders the Amazon thumbnail once available", () => {
		const markup = renderToStaticMarkup(
			<ProductThumbnail
				asin="B012345678"
				thumbnail={{
					status: "available",
					url: "https://example.com/product.jpg",
				}}
				title="Example shirt"
			/>,
		);

		expect(markup).toContain('src="https://example.com/product.jpg"');
		expect(markup).toContain('alt="Example shirt"');
	});

	it("renders a distinct unavailable state after enrichment completes", () => {
		const markup = renderToStaticMarkup(
			<ProductThumbnail
				asin="B012345678"
				thumbnail={{ status: "unavailable" }}
				title="Example shirt"
			/>,
		);

		expect(markup).toContain("No product thumbnail available");
		expect(markup).not.toContain("animate-spin");
	});
});
