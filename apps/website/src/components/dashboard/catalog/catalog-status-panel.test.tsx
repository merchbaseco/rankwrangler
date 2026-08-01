import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogStatusPanel } from "./catalog-status-panel";

describe("Catalog search status panel", () => {
	it("renders a fetching note and skeleton without exposing internal queue state", () => {
		const markup = renderToStaticMarkup(
			<CatalogStatusPanel status={{ kind: "pending" }} />,
		);

		expect(markup).toContain("Checking for current catalog data");
		expect(markup).toContain("animate-pulse");
		expect(markup).not.toContain("queued");
	});

	it("renders a useful empty successful run", () => {
		const markup = renderToStaticMarkup(
			<CatalogStatusPanel
				status={{
					kind: "empty",
					observedAt: "2026-07-24T12:00:00.000Z",
				}}
			/>,
		);

		expect(markup).toContain("No products surfaced");
		expect(markup).toContain("successful");
	});

	it("renders a sanitized error while preserving prior evidence", () => {
		const markup = renderToStaticMarkup(
			<CatalogStatusPanel
				hasPriorEvidence
				status={{ kind: "error", message: "Catalog search failed." }}
			/>,
		);

		expect(markup).toContain("Catalog search failed.");
		expect(markup).toContain("Your previous successful run remains below");
	});

	it("renders nothing over ready results", () => {
		expect(
			renderToStaticMarkup(
				<CatalogStatusPanel status={{ kind: "ready" }} />,
			),
		).toBe("");
	});
});
