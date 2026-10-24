import { z } from 'zod';
import { exploreKeywords } from '@/services/keyword-discovery';
import { defineJob } from './job-router';

export const exploreKeywordsJob = defineJob('explore-keywords', {
    persistSuccess: 'didWork',
    startupSummary: 'bounded SP-API keyword discovery with durable paging',
})
    .input(z.object({}))
    .options({ singletonKey: 'explore-keywords', retryLimit: 0 })
    .interval({ everyMs: 60_000, payload: {} })
    .work(async () => await exploreKeywords());
