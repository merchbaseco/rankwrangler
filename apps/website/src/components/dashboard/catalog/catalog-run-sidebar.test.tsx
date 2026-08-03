import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogRunSidebar } from "./catalog-run-sidebar";

describe("Catalog run sidebar", () => {
	it("offers older retained runs when another page exists", () => {
		const markup = renderToStaticMarkup(
			<CatalogRunSidebar
				hasNextPage
				isFetchingNextPage={false}
				onLoadMore={() => {}}
				onSelectRun={() => {}}
				runs={[]}
				selectedRunId={null}
			/>,
		);

		expect(markup).toContain("Load older runs");
		expect(markup).not.toContain("tracked");
	});
});
