import { z } from 'zod';
import { defineJob } from '@/jobs/job-router.js';
import { recoverStaleProductHistoryOperations } from '@/services/product-history-operations.js';

export const recoverStaleProductHistoryOperationsJob = defineJob(
    'recover-stale-product-history-operations',
    {
        persistSuccess: 'didWork',
        startupSummary: 'interval: every 1m',
    }
)
    .input(z.object({}))
    .options({
        singletonKey: 'recover-stale-product-history-operations',
        retryLimit: 0,
    })
    .interval({
        everyMs: 60 * 1000,
        payload: {},
    })
    .work(async () => {
        const recoveredCount = await recoverStaleProductHistoryOperations();
        return {
            didWork: recoveredCount > 0,
            recoveredCount,
        };
    });
