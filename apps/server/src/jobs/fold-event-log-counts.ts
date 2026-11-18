import { z } from 'zod';
import { foldEventLogCounts } from '@/db/event-log-count-fold';
import { defineJob } from './job-router';

// Every minute: fold the newest events into the histogram counts. The exclusive queue holds one
// tick queued or running, so a catch-up run never has ticks piling up behind it.
export const foldEventLogCountsJob = defineJob('fold-event-log-counts', {
    persistSuccess: 'didWork',
    startupSummary: 'every minute; folds new events into the Status histogram counts',
})
    .input(z.object({}))
    .queue({ policy: 'exclusive' })
    .options({ retryLimit: 0 })
    .interval({ everyMs: 60_000, payload: {} })
    .work(async () => await foldEventLogCounts());
