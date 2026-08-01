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
				onSetTracking={() => {}}
				query={null}
				runs={[]}
				selectedRunId={null}
				trackingError="Tracking could not be updated."
				trackingPending={false}
			/>,
		);

		expect(markup).toContain("Load older runs");
		expect(markup).toContain("Tracking could not be updated.");
	});
});
