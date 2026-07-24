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
