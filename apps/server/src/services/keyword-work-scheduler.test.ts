import { describe, expect, it, mock } from 'bun:test';
import type { JobInsert } from 'pg-boss';
import { scheduleKeywordWork } from './keyword-work-scheduler';

const rows = (...ids: string[]) => ids.map(id => ({ id })) as never;
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
        dueMining: (async (_now: Date, stage: string) =>
            stage === 'pending' ? rows('retry') : rows('saved')) as never,
        unmined: mock(async () => rows('new')) as never,
        dueAutocomplete: (async (_now: Date, stage: string) =>
            stage === 'pending' ? rows('seed') : rows('suggested')) as never,
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
    });
    it('queues heads above depth and every saved response for Jev', async () => {
        const { queues, overrides, inserted } = setup();
        const result = await scheduleKeywordWork(queues, overrides);
        expect(inserted['scan-keyword']).toEqual([
            { data: { targetId: 'head' }, singletonKey: 'head', priority: 1 },
            { data: { targetId: 'deep' }, singletonKey: 'deep', priority: 0 },
        ]);
        expect(inserted['judge-keywords']?.map(job => job.singletonKey)).toEqual([
            'product:saved',
            'seed:suggested',
        ]);
        expect(inserted['recommend-product-keywords']?.map(job => job.singletonKey)).toEqual([
            'retry',
            'new',
        ]);
        expect(result.didWork).toBe(true);
    });
    it('stops new Ads and autocomplete sources while scan backlog is over its allowance', async () => {
        const { queues, overrides, inserted } = setup(false);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['recommend-product-keywords']).toBeUndefined();
        expect(inserted['autocomplete-keyword']).toBeUndefined();
        expect(inserted['judge-keywords']).toHaveLength(2);
    });
    it('only tops producers up to a short queue', async () => {
        const { queues, overrides, inserted } = setup(true, 30);
        await scheduleKeywordWork(queues, overrides);
        expect(inserted['recommend-product-keywords']).toBeUndefined();
        expect(overrides.unmined).not.toHaveBeenCalled();
    });
});
