import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KeywordHistoryProvenance } from "./keyword-history-provenance";

describe("KeywordHistoryProvenance", () => {
	it("shows explicit and automatic refresh provenance for history points", () => {
		const markup = renderToStaticMarkup(
			<KeywordHistoryProvenance
				points={[
					{ observedDate: "2026-08-05", trigger: "requested" },
					{ observedDate: "2026-08-06", trigger: "automatic" },
				]}
			/>,
		);

		expect(markup).toContain("Refresh provenance (2)");
		expect(markup).toContain("Requested refresh");
		expect(markup).toContain("Automatic refresh");
		expect(markup).toContain("2026-08-05");
	});
});
