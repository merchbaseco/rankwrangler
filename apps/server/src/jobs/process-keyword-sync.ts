import { z } from 'zod';
import { processKeywordSync } from '@/services/keyword-sync';
import { defineJob } from './job-router';

export const processKeywordSyncJob = defineJob('process-keyword-sync', {
    persistSuccess: 'didWork',
    startupSummary: 'one pauseable keyword pipeline; ten-second continuation and minute watchdog',
})
    .input(z.object({}))
    .options({ singletonKey: 'process-keyword-sync', retryLimit: 0 })
    .interval({ everyMs: 60_000, payload: {} })
    .work(async (_job, _signal, _log, { boss }) => {
        const result = await processKeywordSync();
        if (result.nextWakeAt && result.nextWakeAt.getTime() <= Date.now() + 60_000)
            await boss.send(
                'process-keyword-sync',
                {},
                {
                    singletonKey: 'process-keyword-sync',
                    retryLimit: 0,
                    startAfter: result.nextWakeAt,
                }
            );
        return result;
    });
