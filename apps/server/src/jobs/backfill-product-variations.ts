import { z } from 'zod';
import { defineJob } from '@/jobs/job-router';
import { backfillProductVariations } from '@/services/product-variation-backfill';

export const backfillProductVariationsJob = defineJob('backfill-product-variations', {
    persistSuccess: 'didWork',
    startupSummary: 'minute fold of unchecked Products into variation families (background SP-API)',
})
    .input(z.object({}))
    .options({ singletonKey: 'backfill-product-variations', retryLimit: 0 })
    .interval({ everyMs: 60 * 1000, payload: {} })
    .work(async () => await backfillProductVariations());
