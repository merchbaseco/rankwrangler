import { z } from 'zod';
import { collectDueCatalogQueries } from '@/services/catalog-query-refresh';
import { defineJob } from './job-router';

export const collectDueCatalogQueriesJob = defineJob('collect-due-catalog-queries', {
    persistSuccess: 'didWork',
    startupSummary: 'minute scan for admitted keyword heads and bounded discovery',
})
    .input(z.object({}))
    .options({
        singletonKey: 'collect-due-catalog-queries',
        retryLimit: 0,
    })
    .interval({
        everyMs: 60 * 1000,
        payload: {},
    })
    .work(async () => {
        return await collectDueCatalogQueries();
    });
