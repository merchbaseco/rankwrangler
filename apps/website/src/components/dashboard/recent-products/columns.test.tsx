import { describe, expect, it } from "bun:test";
import type { ColumnDef } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import { createColumns } from "@/components/dashboard/recent-products/columns";
import type { Product } from "@/components/dashboard/recent-products/types";

describe("recent Product columns", () => {
	it("replaces stale BSR with availability and keeps the ASIN cell compact", () => {
		const columns = createColumns({
			onSelectHistory: () => undefined,
			selectedHistoryKey: null,
		});
		const product = createProduct({ isUnavailable: true, rootCategoryBsr: 2_952_273 });

		const asinMarkup = renderColumn(columns, "asin", product);
		const bsrMarkup = renderColumn(columns, "rootCategoryBsr", product);

		expect(asinMarkup).not.toContain("Unavailable");
		expect(bsrMarkup).toContain("Unavailable");
		expect(bsrMarkup).not.toContain("#2,952,273");
	});
});

const renderColumn = (columns: ColumnDef<Product>[], accessorKey: string, product: Product) => {
	const column = columns.find(candidate =>
		"accessorKey" in candidate ? candidate.accessorKey === accessorKey : false,
	);
	if (!column || typeof column.cell !== "function") {
		throw new Error(`Missing ${accessorKey} column renderer.`);
	}

	const element = column.cell({
		row: {
			original: product,
			getValue: (key: string) => product[key as keyof Product],
		},
	} as never);
	return renderToStaticMarkup(element as React.ReactNode);
};

const createProduct = (overrides: Partial<Product> = {}): Product => ({
	asin: "B0F2T67NHZ",
	marketplaceId: "ATVPDKIKX0DER",
	title: "Baseball Mama At The Ballpark",
	brand: "Baseball Mama Co.",
	bullet1: null,
	bullet2: null,
	dateFirstAvailable: "2025-03-28",
	rootCategoryBsr: 2_952_273,
	isMerchListing: true,
	isUnavailable: false,
	facets: [],
	thumbnail: { status: "available", url: "https://example.com/product.jpg" },
	updatedAt: "2026-08-09T12:00:00.000Z",
	updatedAtMs: Date.parse("2026-08-09T12:00:00.000Z"),
	...overrides,
});
