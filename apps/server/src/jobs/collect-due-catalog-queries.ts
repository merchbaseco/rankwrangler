import { z } from 'zod';
import { defineJob } from './job-router';
import { collectDueCatalogQueries } from '@/services/catalog-query-tracking';

export const collectDueCatalogQueriesJob = defineJob('collect-due-catalog-queries', {
    persistSuccess: 'didWork',
    startupSummary: 'minute scan for explicitly tracked weekly Catalog queries',
})
    .input(z.object({}))
    .options({
        singletonKey: 'collect-due-catalog-queries',
        retryLimit: 0,
    })
    .interval({
        everyMs: 60 * 1_000,
        payload: {},
    })
    .work(async () => {
        return await collectDueCatalogQueries();
    });
