import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { formatFacetBadgeLabel } from "@/components/dashboard/product-history-panel/panel-header";
import { ProductFreshnessButton } from "@/components/dashboard/product-history-panel/product-status-badges";

describe("formatFacetBadgeLabel", () => {
	it("uses known category labels and formatted facet values", () => {
		const result = formatFacetBadgeLabel({
			facet: "party-theme",
			name: "fathers-day",
		});

		expect(result).toBe("Party Theme: Fathers Day");
	});

	it("falls back to raw category key when the facet is unknown", () => {
		const result = formatFacetBadgeLabel({
			facet: "custom-facet",
			name: "my-custom-value",
		});

		expect(result).toBe("custom-facet: My Custom Value");
	});
});

describe("ProductFreshnessButton", () => {
	it("uses neutral freshness copy and keeps Refresh available for stale data", () => {
		const markup = renderToStaticMarkup(
			createElement(ProductFreshnessButton, {
				freshness: { stale: true, updatedAt: "2026-07-01T12:00:00.000Z" },
				isRefreshing: false,
				refreshError: null,
				onRefresh: () => {},
			}),
		);

		expect(markup).toContain("Product updated");
		expect(markup).toContain("Refresh");
		expect(markup).not.toContain("Product stale");
		expect(markup).not.toContain("Product fresh");
	});

	it("shows Refreshing and restrained Retry states without hiding the update label", () => {
		const refreshingMarkup = renderToStaticMarkup(
			createElement(ProductFreshnessButton, {
				freshness: { stale: true, updatedAt: null },
				isRefreshing: true,
				refreshError: null,
				onRefresh: () => {},
			}),
		);
		const retryMarkup = renderToStaticMarkup(
			createElement(ProductFreshnessButton, {
				freshness: { stale: true, updatedAt: null },
				isRefreshing: false,
				refreshError: "Product refresh failed",
				onRefresh: () => {},
			}),
		);

		expect(refreshingMarkup).toContain("Refreshing");
		expect(refreshingMarkup).toContain("Product updated");
		expect(retryMarkup).toContain("Retry");
		expect(retryMarkup).toContain("Product updated");
	});
});
