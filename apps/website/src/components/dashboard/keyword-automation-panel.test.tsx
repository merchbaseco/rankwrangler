import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	KeywordAutomationSummary,
	KeywordAutomationTable,
	type KeywordAutomationItem,
} from "./keyword-automation-panel";

describe("Keyword automation visibility", () => {
	it("renders explicit summary labels and derived status text", () => {
		const markup = renderToStaticMarkup(
			<KeywordAutomationSummary
				summary={{
					active: 4,
					due: 1,
					refreshedRecently: 2,
					waitingOrDeferred: 3,
					failed: 1,
					expiringSoon: 1,
				}}
			/>,
		);

		expect(markup).toContain("Refreshed recently");
		expect(markup).toContain("Waiting / deferred");
		expect(markup).toContain("Expiring soon");
	});

	it("labels a failed keyword in text and offers the research interaction", () => {
		const item: KeywordAutomationItem = {
			id: "11111111-1111-4111-8111-111111111111",
			source: "keepa",
			marketplaceId: "ATVPDKIKX0DER",
			normalizedTerm: "garden shirt",
			displayTerm: "Garden Shirt",
			page: 0,
			lastRequestedAt: "2026-07-24T12:00:00.000Z",
			activeUntil: "2026-08-23T12:00:00.000Z",
			latestSuccessfulRunAt: null,
			nextRefreshAttemptAt: "2026-07-24T13:00:00.000Z",
			lastRefreshAttemptAt: "2026-07-24T12:00:00.000Z",
			nextRefreshAt: "2026-07-24T13:00:00.000Z",
			status: "failed",
			observationCount: 0,
			latestRun: null,
		};
		const markup = renderToStaticMarkup(
			<KeywordAutomationTable
				items={[item]}
				onOpenResearch={() => {}}
			/>,
		);

		expect(markup).toContain("Refresh failed");
		expect(markup).toContain("Status: Refresh failed");
		expect(markup).toContain("Garden Shirt");
	});
});
