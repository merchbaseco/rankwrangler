import { describe, expect, it } from "bun:test";
import { formatFacetBadgeLabel } from "@/components/dashboard/product-history-panel/panel-header";

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
