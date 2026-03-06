import { describe, expect, it } from "bun:test";
import {
	isKeepaSyncStale,
	KEEPA_STALE_REFRESH_MS,
	shouldEvaluateKeepaAutoRefresh,
	shouldTriggerKeepaSync,
} from "./keepa-sync-state";

describe("isKeepaSyncStale", () => {
	it("returns true when latest keepa import timestamp is missing", () => {
		const result = isKeepaSyncStale({ keepaLastSyncAt: null, nowMs: 10_000 });
		expect(result).toBe(true);
	});

	it("returns true when latest keepa import timestamp is invalid", () => {
		const result = isKeepaSyncStale({
			keepaLastSyncAt: "not-a-date",
			nowMs: 10_000,
		});
		expect(result).toBe(true);
	});

	it("returns false when latest keepa import is within the 48 hour window", () => {
		const nowMs = Date.parse("2026-02-24T00:00:00.000Z");
		const freshImport = new Date(
			nowMs - KEEPA_STALE_REFRESH_MS + 60_000,
		).toISOString();
		const result = isKeepaSyncStale({ keepaLastSyncAt: freshImport, nowMs });
		expect(result).toBe(false);
	});

	it("returns true when latest keepa import is older than 48 hours", () => {
		const nowMs = Date.parse("2026-02-24T00:00:00.000Z");
		const staleImport = new Date(
			nowMs - KEEPA_STALE_REFRESH_MS - 1,
		).toISOString();
		const result = isKeepaSyncStale({ keepaLastSyncAt: staleImport, nowMs });
		expect(result).toBe(true);
	});
});

describe("shouldEvaluateKeepaAutoRefresh", () => {
	it("evaluates once rank history query is settled and not yet checked", () => {
		expect(
			shouldEvaluateKeepaAutoRefresh({
				hasCheckedAutoRefresh: false,
				isRankQueryLoading: false,
			}),
		).toBe(true);
	});

	it("does not evaluate while rank history query is still loading", () => {
		expect(
			shouldEvaluateKeepaAutoRefresh({
				hasCheckedAutoRefresh: false,
				isRankQueryLoading: true,
			}),
		).toBe(false);
	});

	it("does not evaluate after first check has already run", () => {
		expect(
			shouldEvaluateKeepaAutoRefresh({
				hasCheckedAutoRefresh: true,
				isRankQueryLoading: false,
			}),
		).toBe(false);
	});
});

describe("shouldTriggerKeepaSync", () => {
	it("triggers sync only when stale and query has no error", () => {
		expect(
			shouldTriggerKeepaSync({
				isRankQueryError: false,
				isKeepaSyncStale: true,
			}),
		).toBe(true);
	});

	it("does not trigger sync when query failed", () => {
		expect(
			shouldTriggerKeepaSync({
				isRankQueryError: true,
				isKeepaSyncStale: true,
			}),
		).toBe(false);
	});

	it("does not trigger sync when keepa data is fresh", () => {
		expect(
			shouldTriggerKeepaSync({
				isRankQueryError: false,
				isKeepaSyncStale: false,
			}),
		).toBe(false);
	});
});
