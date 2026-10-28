import { describe, it, expect } from "bun:test";
import {
	patchKeywordDirectory,
	uniqueKeywordRows,
	type DirectoryRow,
} from "./keyword-directory-cache";
import { createKeywordDirectoryEventUpdates } from "./keyword-directory-event-updates";
const view = {
	asOf: "2026-10-26T12:00:00.000Z",
	trialTurn: true,
	sort: "work" as const,
};
const row = (
	term: string,
	position: number,
	status: DirectoryRow["status"] = "queued",
): DirectoryRow => ({
	id: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
	queryId: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
	term,
	createdAt: view.asOf,
	status,
	untrackedReason: status === "untracked" ? "noMerchFound" : null,
	retryScheduled: false,
	heat: "unrated",
	score: null,
	searchFrequencyRank: null,
	sources: [],
	products: 0,
	merch: 0,
	lastCheckedAt: null,
	nextCheckAt: null,
	intervalDays: null,
	sortKey: [
		1,
		0,
		0,
		0,
		0,
		position,
		`00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
	],
});
const page = (items: DirectoryRow[]) => ({
	items,
	view,
	nextCursor: items.length ? { ...view, key: items.at(-1)!.sortKey } : null,
});
describe("keyword directory event updates", () => {
	it("patches and reorders only changed rows without losing loaded pages", () => {
		const original = {
			pages: [
				page([row("first", 1), row("second", 2)]),
				page([row("third", 3), row("fourth", 4)]),
			],
			pageParams: [undefined, view],
		};
		const patched = patchKeywordDirectory(
			original,
			[{ ...row("fourth", 0), merch: 12 }],
			["fourth"],
			{ limit: 2 },
		);
		expect(patched?.pages.flatMap((p) => p.items).map((r) => r.term)).toEqual([
			"fourth",
			"first",
			"second",
			"third",
		]);
		expect(patched?.pages[0].items[0].merch).toBe(12);
		expect(patched?.pageParams).toEqual(original.pageParams);
		expect(original.pages[1].items[1].merch).toBe(0);
	});
	it("bounds new arrivals and rewinds pagination so displaced rows remain reachable", () => {
		const original = {
			pages: [page([row("second", 2), row("third", 3)])],
			pageParams: [undefined],
		};
		const patched = patchKeywordDirectory(
			original,
			[row("first", 1)],
			["first"],
			{ limit: 2 },
		)!;
		expect(patched.pages[0].items.map((r) => r.term)).toEqual([
			"first",
			"second",
		]);
		expect(patched.pages[0].nextCursor?.key).toEqual(row("second", 2).sortKey);
		expect(
			uniqueKeywordRows([
				...patched.pages,
				page([row("second", 2), row("third", 3)]),
			]).map((r) => r.term),
		).toEqual(["first", "second", "third"]);
	});
	it("removes rows that stop matching and never advances past unseen rows", () => {
		const original = {
			pages: [page([row("first", 1), row("second", 2)])],
			pageParams: [undefined],
		};
		const patched = patchKeywordDirectory(
			original,
			[row("first", 1, "untracked"), row("later", 9)],
			["first", "later"],
			{ limit: 2 },
		)!;
		expect(patched.pages[0].items.map((r) => r.term)).toEqual([
			"second",
			"later",
		]);
		expect(patched.pages[0].nextCursor?.key).toEqual(
			original.pages[0].nextCursor?.key,
		);
	});
	it("batches notifications into a row read, not a table refetch", async () => {
		const reads: string[][] = [];
		const patched: string[][] = [];
		let reconciled = 0;
		const complete = deferred<void>();
		const events = createKeywordDirectoryEventUpdates({
			view: () => view,
			read: async (terms) => {
				reads.push(terms);
				return terms.map((term, i) => row(term, i));
			},
			patch: (_rows, terms) => {
				patched.push(terms);
				complete.resolve();
				return true;
			},
			reconcile: async () => {
				reconciled++;
			},
		});
		events.onData({ kind: "changed", data: { terms: ["fishing"] } });
		events.onData({
			kind: "changed",
			data: { terms: ["fishing", "hawaiian christmas"] },
		});
		await complete.promise;
		events.dispose();
		expect(reads).toEqual([["fishing", "hawaiian christmas"]]);
		expect(patched).toEqual(reads);
		expect(reconciled).toBe(0);
	});
	it("serializes row reads while collecting newer events", async () => {
		const first = deferred<void>();
		const release = deferred<DirectoryRow[]>();
		const second = deferred<void>();
		const reads: string[][] = [];
		const patches: string[][] = [];
		const events = createKeywordDirectoryEventUpdates({
			view: () => view,
			read: async (terms) => {
				reads.push(terms);
				if (reads.length === 1) {
					first.resolve();
					return release.promise;
				}
				return terms.map((term, i) => row(term, i));
			},
			patch: (_rows, terms) => {
				patches.push(terms);
				if (patches.length === 2) second.resolve();
				return true;
			},
			reconcile: async () => {},
		});
		events.onData({ kind: "changed", data: { terms: ["first"] } });
		await first.promise;
		events.onData({ kind: "changed", data: { terms: ["second"] } });
		expect(reads).toEqual([["first"]]);
		release.resolve([row("first", 1)]);
		await second.promise;
		events.dispose();
		expect(reads).toEqual([["first"], ["second"]]);
		expect(patches).toEqual(reads);
	});
	it("discards a row response overtaken by reconnection", async () => {
		const first = deferred<void>();
		const response = deferred<DirectoryRow[]>();
		const resynced = deferred<void>();
		let patches = 0;
		const events = createKeywordDirectoryEventUpdates({
			view: () => view,
			read: () => {
				first.resolve();
				return response.promise;
			},
			patch: () => {
				patches++;
				return true;
			},
			reconcile: async () => {
				resynced.resolve();
			},
		});
		events.onData({ kind: "changed", data: { terms: ["first"] } });
		await first.promise;
		events.onData({ kind: "resync" });
		response.resolve([row("first", 1)]);
		await resynced.promise;
		events.dispose();
		expect(patches).toBe(0);
	});
	it("does not write a late response after unmount", async () => {
		const started = deferred<void>();
		const response = deferred<DirectoryRow[]>();
		let patched = 0;
		const events = createKeywordDirectoryEventUpdates({
			view: () => view,
			read: () => {
				started.resolve();
				return response.promise;
			},
			patch: () => {
				patched++;
				return true;
			},
			reconcile: async () => {},
		});
		events.onData({ kind: "changed", data: { terms: ["fishing"] } });
		await started.promise;
		events.dispose();
		response.resolve([row("fishing", 1)]);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(patched).toBe(0);
	});
	it("re-reads terms after a fetch was in flight instead of losing the patch", async () => {
		let fetching = true;
		const patched = deferred<string[]>();
		const events = createKeywordDirectoryEventUpdates({
			view: () => view,
			read: async (terms) => terms.map((term, i) => row(term, i)),
			patch: (_rows, terms) => {
				if (fetching) {
					fetching = false;
					return false;
				}
				patched.resolve(terms);
				return true;
			},
			reconcile: async () => {},
		});
		events.onData({ kind: "changed", data: { terms: ["fishing"] } });
		expect(await patched.promise).toEqual(["fishing"]);
		events.dispose();
	});
});

const deferred = <T>() => {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
