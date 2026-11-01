import { z } from 'zod';
import { syncRunningGate } from '@/db/provider-gates';
import { scanKeywordPage } from '@/services/keyword-discovery';
import { defineJob } from './job-router';
import { keywordQueueOptions, keywordQueues, scanPriority } from './keyword-job-queues';

// One SP-API search page for one keyword: a due head check or the next page of a deeper pass.
// Four jobs run at once so the Catalog limiter always has a page waiting; the limiter alone sets
// the pace. While sync is paused the queue fetches nothing and jobs stay queued.
export const scanKeywordJob = defineJob(keywordQueues.scan, {
    persistSuccess: 'didWork',
    startupSummary: 'one SP-API keyword page per job, 4 at once, paced by the Catalog limiter',
})
    .input(z.object({ targetId: z.string().uuid() }))
    .queue(keywordQueueOptions)
    .gate(syncRunningGate, { concurrency: 4 })
    .work(async job => {
        const result = await scanKeywordPage(job.data.targetId);
        switch (result.kind) {
            case 'scanned':
                return {
                    ...result,
                    followup: result.continues
                        ? { at: new Date(), priority: scanPriority.depth }
                        : null,
                };
            // Paused mid-wait: back in the queue at the same priority, fetched once sync resumes.
            case 'paused':
                return { ...result, followup: { at: new Date() } };
            case 'notDue':
            case 'lostClaim':
                return result;
            default:
                return assertNever(result);
        }
    });

const assertNever = (value: never): never => {
    throw new Error(`Unhandled keyword scan result: ${JSON.stringify(value)}`);
};
