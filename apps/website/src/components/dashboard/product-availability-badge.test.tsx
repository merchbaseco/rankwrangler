import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductAvailabilityBadge } from "@/components/dashboard/product-availability-badge";

describe("ProductAvailabilityBadge", () => {
	it("labels Products Amazon no longer returns without hiding their row", () => {
		const markup = renderToStaticMarkup(
			<ProductAvailabilityBadge isUnavailable={true} />,
		);

		expect(markup).toContain("Unavailable");
	});

	it("renders nothing for available Products", () => {
		expect(
			renderToStaticMarkup(
				<ProductAvailabilityBadge isUnavailable={false} />,
			),
		).toBe("");
	});
});
