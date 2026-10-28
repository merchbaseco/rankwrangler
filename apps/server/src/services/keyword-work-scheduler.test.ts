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
            { id: 'head', depth: false },
            { id: 'deep', depth: true },
        ]) as never,
        dueAutocomplete: mock(async () => [{ id: 'seed' }]) as never,
        dueImport: (async () => ({ id: 'week' })) as never,
        registerTrials: mock(async () => 500),
        promote: mock(async () => 0),
    };
    return { queues, overrides, inserted };
};

describe('keyword work scheduler', () => {
    it('enqueues nothing while paused', async () => {
        const { queues, overrides, inserted } = setup();
        expect(
            await scheduleKeywordWork(queues, { ...overrides, isPaused: async () => true })
        ).toEqual({ didWork: false, paused: true });
        expect(inserted).toEqual({});
        expect(overrides.registerTrials).not.toHaveBeenCalled();
    });
    it('queues heads above depth, the due import and new trials', async () => {
        const { queues, overrides, inserted } = setup();
        const result = await scheduleKeywordWork(queues, overrides);
        expect(inserted['scan-keyword']).toEqual([
            { data: { targetId: 'head' }, singletonKey: 'head', priority: 1 },
            { data: { targetId: 'deep' }, singletonKey: 'deep', priority: 0 },
        ]);
        expect(inserted['import-brand-analytics']).toEqual([
            { data: { importId: 'week' }, singletonKey: 'week' },
        ]);
        expect(inserted['autocomplete-keyword']?.map(job => job.singletonKey)).toEqual(['seed']);
        expect(result.didWork).toBe(true);
        expect(result.enqueued?.trials).toBe(500);
    });
    it('registers no trials or seeds while scan backlog is over its allowance', async () => {
        const { queues, overrides, inserted } = setup(false);
        await scheduleKeywordWork(queues, overrides);
        expect(overrides.registerTrials).not.toHaveBeenCalled();
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(inserted['import-brand-analytics']).toHaveLength(1);
    });
    it('only tops autocomplete up to a short queue', async () => {
        const { queues, overrides, inserted } = setup(true, 30);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(overrides.dueAutocomplete).not.toHaveBeenCalled();
    });
});
