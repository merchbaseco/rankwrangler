import { z } from 'zod';
import { defineJob } from './job-router';
import { recoverStaleCatalogSearchOperations } from '@/services/catalog-search';

export const recoverStaleCatalogSearchOperationsJob = defineJob(
    'recover-stale-catalog-search-operations',
    {
        persistSuccess: 'didWork',
        startupSummary: 'interval: every 1m',
    }
)
    .input(z.object({}))
    // One tick queued or running: ticks sent during a slow run are dropped, not stacked.
    .queue({ policy: 'exclusive' })
    .options({
        singletonKey: 'recover-stale-catalog-search-operations',
        retryLimit: 0,
    })
    .interval({
        everyMs: 60 * 1000,
        payload: {},
    })
    .work(async () => {
        const recoveredCount = await recoverStaleCatalogSearchOperations();
        return {
            didWork: recoveredCount > 0,
            recoveredCount,
        };
    });
