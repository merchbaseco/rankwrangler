import { describe, expect, it, mock } from 'bun:test';
import type { JobInsert } from 'pg-boss';
import { scheduleKeywordWork } from './keyword-work-scheduler';

const setup = (queued: Partial<Record<string, number>> = {}) => {
    const inserted: Record<string, JobInsert[]> = {};
    const queues = {
        queued: mock(async (name: string) => queued[name] ?? 0),
        insert: mock(async (name: string, jobs: JobInsert[]) => {
            inserted[name] = [...(inserted[name] ?? []), ...jobs];
            return jobs.length;
        }),
    };
    const overrides = {
        isPaused: async () => false,
        dueScans: mock(async () => [
            { id: 'head', depth: false, tracked: false },
            { id: 'recheck', depth: false, tracked: true },
            { id: 'deep', depth: true, tracked: true },
        ]),
        dueTrackedHeads: mock(async () => [{ id: 'recheck', depth: false, tracked: true }]),
        dueAutocomplete: mock(async () => [{ id: 'seed' }, { id: 'seed-2' }]) as never,
        duePrefixes: mock(async () => [{ id: 'prefix' }]) as never,
        backfillPrefixes: mock(async () => ({ scanned: 0, registered: 0 })),
        promote: mock(async () => 4),
    };
    return { queues, overrides, inserted };
};

describe('keyword work scheduler', () => {
    it('enqueues nothing while paused', async () => {
        const { queues, overrides, inserted } = setup();
        expect(
            await scheduleKeywordWork(queues, { ...overrides, isPaused: async () => true })
        ).toEqual({ didWork: false, paused: true, prefixesRegistered: 0 });
        expect(inserted).toEqual({});
        // The prefix backfill is database-only and keeps running while paused.
        expect(overrides.backfillPrefixes).toHaveBeenCalled();
    });
    it('queues re-checks above trial heads above depth, and autocomplete seeds and prefixes', async () => {
        const { queues, overrides, inserted } = setup();
        const result = await scheduleKeywordWork(queues, overrides);
        expect(inserted['scan-keyword']).toEqual([
            { data: { targetId: 'recheck' }, singletonKey: 'recheck', priority: 2 },
            { data: { targetId: 'head' }, singletonKey: 'head', priority: 1 },
            { data: { targetId: 'deep' }, singletonKey: 'deep', priority: 0 },
        ]);
        expect(inserted['autocomplete-keyword']).toEqual([
            { data: { queryId: 'seed' }, singletonKey: 'seed' },
            { data: { prefixId: 'prefix' }, singletonKey: 'prefix:prefix' },
            { data: { queryId: 'seed-2' }, singletonKey: 'seed-2' },
        ]);
        expect(result.didWork).toBe(true);
        expect(result).toMatchObject({ scanQueueFull: false });
    });
    it('skips general due scans while full, but still enqueues tracked re-checks, tops up and promotes', async () => {
        const { queues, overrides, inserted } = setup({ 'scan-keyword': 1000 });
        const result = await scheduleKeywordWork(queues, overrides);
        expect(overrides.dueScans).not.toHaveBeenCalled();
        expect(overrides.dueTrackedHeads).toHaveBeenCalledWith(expect.any(Date), 500);
        expect(inserted['scan-keyword']).toEqual([
            { data: { targetId: 'recheck' }, singletonKey: 'recheck', priority: 2 },
        ]);
        expect(overrides.promote).toHaveBeenCalled();
        expect(inserted['autocomplete-keyword']).toHaveLength(3);
        expect(result).toMatchObject({
            didWork: true,
            scanQueueFull: true,
            enqueued: { scanHeads: 1, scanDepth: 0, autocomplete: 3, depthPromoted: 4 },
        });
    });
    it('lists due scans while the scan queue is below a batch', async () => {
        const { queues, overrides } = setup({ 'scan-keyword': 999 });
        const result = await scheduleKeywordWork(queues, overrides);
        expect(overrides.dueScans).toHaveBeenCalledWith(expect.any(Date), 1000);
        expect(result).toMatchObject({
            scanQueueFull: false,
            enqueued: { scanHeads: 2, scanDepth: 1 },
        });
    });
    it('only tops autocomplete up to a short queue', async () => {
        const { queues, overrides, inserted } = setup({ 'autocomplete-keyword': 30 });
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(overrides.dueAutocomplete).not.toHaveBeenCalled();
        expect(overrides.duePrefixes).not.toHaveBeenCalled();
    });
    it('shares the autocomplete top-up between seeds and prefixes', async () => {
        const { queues, overrides, inserted } = setup({ 'autocomplete-keyword': 28 });
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']?.map(job => job.singletonKey)).toEqual([
            'seed',
            'prefix:prefix',
        ]);
    });
});
