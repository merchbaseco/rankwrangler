import { describe, expect, it } from 'bun:test';
import { type DirectoryRow, matchesDirectory, patchKeywordPage } from './keyword-directory-cache';
import { createKeywordDirectoryEventUpdates } from './keyword-directory-event-updates';

const view = {
    asOf: '2026-10-26T12:00:00.000Z',
    sort: 'work' as const,
};
const row = (
    term: string,
    position: number,
    freshness: DirectoryRow['freshness'] = 'needsSync'
): DirectoryRow => ({
    id: `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    queryId: `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    term,
    createdAt: view.asOf,
    stage: 'graduated',
    freshness,
    retryScheduled: false,
    heat: 'unrated',
    score: null,
    searchFrequencyRank: null,
    sources: [],
    products: 0,
    merch: 0,
    lastCheckedAt: null,
    nextCheckAt: null,
    intervalDays: null,
    shelf: [],
    medianBsr: null,
    freshCount: 0,
    facet: null,
    scoreDelta7d: null,
    scoreTrend12w: [],
    sortKey: [
        1,
        0,
        0,
        0,
        0,
        position,
        `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    ],
});
const page = (items: DirectoryRow[]) => ({
    items,
    view,
    nextCursor: null,
    total: items.length,
});
describe('keyword directory page patches', () => {
    it('re-sorts a changed row within its page without growing it', () => {
        const original = page([row('first', 1), row('second', 2), row('third', 3)]);
        const patched = patchKeywordPage(original, [{ ...row('third', 0), merch: 12 }], ['third'], {
            page: 1,
            pageSize: 3,
        });
        expect(patched?.items.map(r => r.term)).toEqual(['third', 'first', 'second']);
        expect(patched?.items[0].merch).toBe(12);
        expect(original.items[2].merch).toBe(0);
    });
    it('takes an arrival above the end of page one and pushes the last row off', () => {
        const patched = patchKeywordPage(
            page([row('second', 2), row('third', 3)]),
            [row('first', 1)],
            ['first'],
            { page: 1, pageSize: 2 }
        );
        expect(patched?.items.map(r => r.term)).toEqual(['first', 'second']);
    });
    it('leaves an arrival outside a later page to the page it belongs on', () => {
        const patched = patchKeywordPage(
            page([row('third', 3), row('fourth', 4)]),
            [row('first', 1)],
            ['first'],
            { page: 2, pageSize: 2 }
        );
        expect(patched?.items.map(r => r.term)).toEqual(['third', 'fourth']);
    });
    it('drops rows that stop matching the filters', () => {
        const patched = patchKeywordPage(
            page([row('first', 1), row('second', 2)]),
            [
                row('first', 1, 'live'),
                { ...row('second', 2), facet: { facet: 'hobby', name: 'x' } },
            ],
            ['first', 'second'],
            { facet: 'hobby', page: 1, pageSize: 2, freshness: ['needsSync'] }
        );
        expect(patched?.items.map(r => r.term)).toEqual(['second']);
    });
    it('reads the sidebar filters the way the server does', () => {
        const elite = { ...row('elite', 1), merch: 3, heat: 'hot' as const };
        elite.shelf = [
            {
                asin: 'B0',
                firstAvailableAt: null,
                salesRank: 900,
                shortName: null,
                thumbnailUrl: null,
            },
        ] as DirectoryRow['shelf'];
        expect(
            matchesDirectory(elite, { heat: ['hot'], merch: 'tracked', shelfElite: 'has' })
        ).toBe(true);
        expect(matchesDirectory(elite, { shelfElite: 'none' })).toBe(false);
        expect(matchesDirectory(elite, { merch: 'none' })).toBe(false);
        expect(matchesDirectory(elite, { heat: ['cold'] })).toBe(false);
    });
});
describe('keyword directory event updates', () => {
    it('batches notifications into a row read, not a table refetch', async () => {
        const reads: string[][] = [];
        const patched: string[][] = [];
        let reconciled = 0;
        const complete = deferred<void>();
        const events = createKeywordDirectoryEventUpdates({
            view: () => view,
            read: async terms => {
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
        events.onData({ kind: 'changed', data: { terms: ['fishing'] } });
        events.onData({
            kind: 'changed',
            data: { terms: ['fishing', 'hawaiian christmas'] },
        });
        await complete.promise;
        events.dispose();
        expect(reads).toEqual([['fishing', 'hawaiian christmas']]);
        expect(patched).toEqual(reads);
        expect(reconciled).toBe(0);
    });
    it('serializes row reads while collecting newer events', async () => {
        const first = deferred<void>();
        const release = deferred<DirectoryRow[]>();
        const second = deferred<void>();
        const reads: string[][] = [];
        const patches: string[][] = [];
        const events = createKeywordDirectoryEventUpdates({
            view: () => view,
            read: async terms => {
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
        events.onData({ kind: 'changed', data: { terms: ['first'] } });
        await first.promise;
        events.onData({ kind: 'changed', data: { terms: ['second'] } });
        expect(reads).toEqual([['first']]);
        release.resolve([row('first', 1)]);
        await second.promise;
        events.dispose();
        expect(reads).toEqual([['first'], ['second']]);
        expect(patches).toEqual(reads);
    });
    it('discards a row response overtaken by reconnection', async () => {
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
        events.onData({ kind: 'changed', data: { terms: ['first'] } });
        await first.promise;
        events.onData({ kind: 'resync' });
        response.resolve([row('first', 1)]);
        await resynced.promise;
        events.dispose();
        expect(patches).toBe(0);
    });
    it('does not write a late response after unmount', async () => {
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
        events.onData({ kind: 'changed', data: { terms: ['fishing'] } });
        await started.promise;
        events.dispose();
        response.resolve([row('fishing', 1)]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(patched).toBe(0);
    });
    it('re-reads terms after a fetch was in flight instead of losing the patch', async () => {
        let fetching = true;
        const patched = deferred<string[]>();
        const events = createKeywordDirectoryEventUpdates({
            view: () => view,
            read: async terms => terms.map((term, i) => row(term, i)),
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
        events.onData({ kind: 'changed', data: { terms: ['fishing'] } });
        expect(await patched.promise).toEqual(['fishing']);
        events.dispose();
    });
});

const deferred = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
};
