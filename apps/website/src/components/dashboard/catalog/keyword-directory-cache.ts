import type { InfiniteData } from "@tanstack/react-query";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

type Page = RouterOutputs["api"]["app"]["keywordDirectory"];
export type DirectoryInput = RouterInputs["api"]["app"]["keywordDirectory"];
export type DirectoryRow = Page["items"][number];
export const patchKeywordDirectory = <TPageParam>(
	previous: InfiniteData<Page, TPageParam> | undefined,
	updates: DirectoryRow[],
	changedTerms: readonly string[],
	input: DirectoryInput,
): InfiniteData<Page, TPageParam> | undefined => {
	if (!previous) return previous;
	const changed = new Set(changedTerms);
	const rows = new Map(
		previous.pages
			.flatMap((page) => page.items)
			.filter((row) => !changed.has(row.term))
			.map((row) => [row.term, row]),
	);
	for (const row of updates) {
		if (matchesDirectory(row, input)) rows.set(row.term, row);
	}
	const ordered = [...rows.values()].sort((a, b) =>
		compareKeys(a.sortKey, b.sortKey),
	);
	const limit = input.limit ?? 50;
	const capacity = previous.pages.length * limit;
	const visible = ordered.slice(0, capacity);
	const pages = previous.pages.map((page, index) => ({
		...page,
		items: visible.slice(index * limit, (index + 1) * limit),
	}));
	const lastPage = pages.at(-1);
	const last = visible.at(-1);
	const oldCursor = previous.pages.at(-1)?.nextCursor;
	if (lastPage && last && (ordered.length > capacity || oldCursor)) {
		// Never advance past the original unseen boundary. Rewind when arrivals displace rows,
		// so those rows can still be reached by Load more instead of disappearing in a gap.
		lastPage.nextCursor =
			oldCursor && compareKeys(oldCursor.key, last.sortKey) < 0
				? oldCursor
				: { ...lastPage.view, key: last.sortKey };
	}
	return { ...previous, pages };
};
export const uniqueKeywordRows = (pages: Page[]) => {
	const rows = new Map<string, DirectoryRow>();
	for (const page of pages)
		for (const row of page.items)
			if (!rows.has(row.term)) rows.set(row.term, row);
	return [...rows.values()].sort((a, b) => compareKeys(a.sortKey, b.sortKey));
};
const matchesDirectory = (row: DirectoryRow, input: DirectoryInput) =>
	(!input.search || row.term.includes(input.search.toLowerCase())) &&
	(input.stage === "all" || row.stage === (input.stage ?? "graduated")) &&
	(!input.freshness ||
		input.freshness === "all" ||
		row.freshness === input.freshness) &&
	(!input.heat || input.heat === "all" || row.heat === input.heat);
const compareKeys = (
	a: DirectoryRow["sortKey"],
	b: DirectoryRow["sortKey"],
) => {
	for (let i = 0; i < 6; i++) {
		const difference = Number(a[i]) - Number(b[i]);
		if (difference) return difference;
	}
	return String(a[6]).localeCompare(String(b[6]));
};
