import { describe, expect, it, mock } from 'bun:test';
import type { JobInsert } from 'pg-boss';
import { scheduleKeywordWork } from './keyword-work-scheduler';

const backlog = (producersOpen: boolean) =>
    (async () => ({
        queuedPages: 0,
        pagesPerDay: 9677,
        producersOpen,
        dueHeads: 0,
        oldestDueHeadAt: null,
    })) as never;
const setup = (producersOpen = true, queued = 0) => {
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
        backlog: backlog(producersOpen),
        dueScans: (async () => [
            { id: 'head', depth: false, tracked: false },
            { id: 'recheck', depth: false, tracked: true },
            { id: 'deep', depth: true, tracked: true },
        ]) as never,
        dueAutocomplete: mock(async () => [{ id: 'seed' }, { id: 'seed-2' }]) as never,
        dueThemes: mock(async () => [{ id: 'theme' }]) as never,
        backfillThemes: mock(async () => ({ scanned: 0, registered: 0 })),
        promote: mock(async () => 0),
    };
    return { queues, overrides, inserted };
};

describe('keyword work scheduler', () => {
    it('enqueues nothing while paused', async () => {
        const { queues, overrides, inserted } = setup();
        expect(
            await scheduleKeywordWork(queues, { ...overrides, isPaused: async () => true })
        ).toEqual({ didWork: false, paused: true, themesRegistered: 0 });
        expect(inserted).toEqual({});
        // The theme backfill is database-only and keeps running while paused.
        expect(overrides.backfillThemes).toHaveBeenCalled();
    });
    it('queues re-checks above trial heads above depth, and autocomplete seeds and themes', async () => {
        const { queues, overrides, inserted } = setup();
        const result = await scheduleKeywordWork(queues, overrides);
        expect(inserted['scan-keyword']).toEqual([
            { data: { targetId: 'head' }, singletonKey: 'head', priority: 1 },
            { data: { targetId: 'recheck' }, singletonKey: 'recheck', priority: 2 },
            { data: { targetId: 'deep' }, singletonKey: 'deep', priority: 0 },
        ]);
        expect(inserted['autocomplete-keyword']).toEqual([
            { data: { queryId: 'seed' }, singletonKey: 'seed' },
            { data: { themeId: 'theme' }, singletonKey: 'theme:theme' },
            { data: { queryId: 'seed-2' }, singletonKey: 'seed-2' },
        ]);
        expect(result.didWork).toBe(true);
    });
    it('adds no autocomplete seeds while scan backlog is over its allowance', async () => {
        const { queues, overrides, inserted } = setup(false);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(inserted['scan-keyword']).toHaveLength(3);
    });
    it('only tops autocomplete up to a short queue', async () => {
        const { queues, overrides, inserted } = setup(true, 30);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(overrides.dueAutocomplete).not.toHaveBeenCalled();
        expect(overrides.dueThemes).not.toHaveBeenCalled();
    });
    it('shares the autocomplete top-up between seeds and themes', async () => {
        const { queues, overrides, inserted } = setup(true, 28);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']?.map(job => job.singletonKey)).toEqual([
            'seed',
            'theme:theme',
        ]);
    });
});
