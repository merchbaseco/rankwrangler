import { z } from 'zod';
import { scheduleKeywordWork } from '@/services/keyword-work-scheduler';
import { defineJob } from './job-router';

// Every minute while sync runs: enqueue due keyword scans and top up autocomplete. Calls no
// provider.
export const scheduleKeywordWorkJob = defineJob('schedule-keyword-work', {
    persistSuccess: 'didWork',
    startupSummary: 'every minute; enqueues due keyword scans and autocomplete',
})
    .input(z.object({}))
    .queue({ policy: 'singleton' })
    .interval({ everyMs: 60_000, payload: {} })
    .work((_job, _signal, _log, { boss }) =>
        scheduleKeywordWork({
            queued: async name => (await boss.getQueueStats(name)).queuedCount,
            insert: async (name, jobs) =>
                jobs.length
                    ? ((await boss.insert(name, jobs, { returnId: true }))?.length ?? 0)
                    : 0,
        })
    );
