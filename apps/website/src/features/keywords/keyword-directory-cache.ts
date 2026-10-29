import type { RouterInputs, RouterOutputs } from '@/lib/trpc';

type Page = RouterOutputs['api']['app']['keywordDirectory'];
export type DirectoryInput = RouterInputs['api']['app']['keywordDirectory'];
export type DirectoryRow = Page['items'][number];

/**
 * Patches realtime row reads into one grid page: changed terms leave the page,
 * re-reads that still match the filters come back, and a matching arrival
 * joins when its sort key falls inside the page's range (or the page has
 * room at the end of the list). The page re-sorts by the server's sort key
 * and never grows past its size; rows pushed off it remain on the next page,
 * which reads fresh when shown. The total is left to the next read.
 */
export const patchKeywordPage = (
    previous: Page | undefined,
    updates: readonly DirectoryRow[],
    changedTerms: readonly string[],
    input: DirectoryInput
): Page | undefined => {
    if (!previous) {
        return previous;
    }
    const size = input.pageSize ?? input.limit ?? 50;
    const changed = new Set(changedTerms);
    const onPage = new Set(previous.items.map(row => row.term));
    const first = previous.items[0]?.sortKey;
    const last = previous.items.at(-1)?.sortKey;
    const isLastPage = previous.items.length < size;
    const rows = new Map(
        previous.items.filter(row => !changed.has(row.term)).map(row => [row.term, row])
    );
    for (const row of updates) {
        // Page one takes anything above its last row; later pages only what falls between their ends.
        const afterFirst =
            (input.page ?? 1) === 1 || !first || compareKeys(row.sortKey, first) >= 0;
        const beforeLast = isLastPage || !last || compareKeys(row.sortKey, last) <= 0;
        const belongs = onPage.has(row.term) || (afterFirst && beforeLast);
        if (belongs && matchesDirectory(row, input)) {
            rows.set(row.term, row);
        }
    }
    const items = [...rows.values()]
        .sort((a, b) => compareKeys(a.sortKey, b.sortKey))
        .slice(0, size);
    return { ...previous, items };
};

/** Whether a re-read row still passes the grid's filters (the server's rules, client side). */
export const matchesDirectory = (row: DirectoryRow, input: DirectoryInput) =>
    (!input.search || row.term.includes(input.search.toLowerCase())) &&
    (!input.stage?.length || (input.stage as readonly string[]).includes(row.stage)) &&
    (!input.freshness?.length ||
        (row.freshness !== null &&
            (input.freshness as readonly string[]).includes(row.freshness))) &&
    (!input.heat?.length || (input.heat as readonly string[]).includes(row.heat)) &&
    (!input.facet || row.facet?.facet === input.facet) &&
    (!input.shelfElite || hasEliteShelf(row) === (input.shelfElite === 'has')) &&
    (!input.merch || row.merch > 0 === (input.merch === 'tracked'));

/** The server's Elite bound (BSR ≤ 2,500) on any top-ten shelf product. */
const hasEliteShelf = (row: DirectoryRow) =>
    row.shelf.some(product => product.salesRank !== null && product.salesRank <= 2500);

const compareKeys = (a: DirectoryRow['sortKey'], b: DirectoryRow['sortKey']) => {
    for (let index = 0; index < 6; index++) {
        const difference = Number(a[index]) - Number(b[index]);
        if (difference) {
            return difference;
        }
    }
    return String(a[6]).localeCompare(String(b[6]));
};
