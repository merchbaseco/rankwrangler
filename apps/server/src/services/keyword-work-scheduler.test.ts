import { describe, expect, it, mock } from 'bun:test';
import type { JobInsert } from 'pg-boss';
import { scheduleKeywordWork } from './keyword-work-scheduler';

const setup = (queued = 0) => {
    const inserted: Record<string, JobInsert[]> = {};
    const queues = {
        queued: mock(async () => queued),
        insert: mock(async (name: string, jobs: JobInsert[]) => {
            inserted[name] = [...(inserted[name] ?? []), ...jobs];
            return jobs.length;
        }),
    };
    const overrides = {
        isPaused: async () => false,
        dueScans: (async () => [
            { id: 'head', depth: false, tracked: false },
            { id: 'recheck', depth: false, tracked: true },
            { id: 'deep', depth: true, tracked: true },
        ]) as never,
        dueAutocomplete: mock(async () => [{ id: 'seed' }, { id: 'seed-2' }]) as never,
        duePrefixes: mock(async () => [{ id: 'prefix' }]) as never,
        backfillPrefixes: mock(async () => ({ scanned: 0, registered: 0 })),
        promote: mock(async () => 0),
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
            { data: { targetId: 'head' }, singletonKey: 'head', priority: 1 },
            { data: { targetId: 'recheck' }, singletonKey: 'recheck', priority: 2 },
            { data: { targetId: 'deep' }, singletonKey: 'deep', priority: 0 },
        ]);
        expect(inserted['autocomplete-keyword']).toEqual([
            { data: { queryId: 'seed' }, singletonKey: 'seed' },
            { data: { prefixId: 'prefix' }, singletonKey: 'prefix:prefix' },
            { data: { queryId: 'seed-2' }, singletonKey: 'seed-2' },
        ]);
        expect(result.didWork).toBe(true);
    });
    it('only tops autocomplete up to a short queue', async () => {
        const { queues, overrides, inserted } = setup(30);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(overrides.dueAutocomplete).not.toHaveBeenCalled();
        expect(overrides.duePrefixes).not.toHaveBeenCalled();
    });
    it('shares the autocomplete top-up between seeds and prefixes', async () => {
        const { queues, overrides, inserted } = setup(28);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']?.map(job => job.singletonKey)).toEqual([
            'seed',
            'prefix:prefix',
        ]);
    });
});
