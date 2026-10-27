import { z } from 'zod';
import { scheduleKeywordWork } from '@/services/keyword-work-scheduler';
import { defineJob } from './job-router';

// Every minute: enqueue due keyword scans, saved responses awaiting Jev, and, while scan backlog
// allows, a short queue of new Ads and autocomplete sources. Calls no provider itself.
export const scheduleKeywordWorkJob = defineJob('schedule-keyword-work', {
    persistSuccess: 'didWork',
    startupSummary: 'every minute; enqueues due keyword scans, judgments and gated producers',
})
    .input(z.object({}))
    .queue({ policy: 'singleton' })
    .interval({ everyMs: 60_000, payload: {} })
    .work((_job, _signal, _log, { boss }) =>
        scheduleKeywordWork({
            queued: async name => (await boss.getQueueStats(name)).queuedCount,
            insert: async (name, jobs) =>
                jobs.length ? ((await boss.insert(name, jobs, { returnId: true }))?.length ?? 0) : 0,
        })
    );
