import { z } from 'zod';
import { spApiBackgroundGate } from '@/db/provider-gates';
import { scanKeywordPage } from '@/services/keyword-discovery';
import { defineJob } from './job-router';
import { keywordQueueOptions, keywordQueues, scanPriority } from './keyword-job-queues';

// One SP-API search page for one keyword: a due head check or the next page of a deeper pass.
export const scanKeywordJob = defineJob(keywordQueues.scan, {
    persistSuccess: 'didWork',
    startupSummary: 'one SP-API keyword page per job, gated by background Catalog capacity',
})
    .input(z.object({ targetId: z.string().uuid() }))
    .queue(keywordQueueOptions)
    .gate(spApiBackgroundGate, { concurrency: 4 })
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
            case 'waiting':
                return { ...result, followup: { at: result.retryAt } };
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
