import type { PgBoss } from 'pg-boss';
import { startRegisteredJobs } from '@/jobs/job-router.js';

import '@/jobs/enqueue-scheduled-keepa-history-refresh.js';
import '@/jobs/fetch-top-search-terms-dataset.js';
import '@/jobs/fetch-keepa-history-for-asin.js';
import '@/jobs/process-product-facet-classification.js';
import '@/jobs/process-keepa-history-refresh-queue.js';
import '@/jobs/process-spapi-sync-queue.js';
import '@/jobs/reprocess-stale-products.js';
import '@/jobs/sync-top-search-terms-datasets.js';

export const startJobs = async (boss: PgBoss) => {
    return startRegisteredJobs(boss);
};
