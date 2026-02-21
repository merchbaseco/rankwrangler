import type { PgBoss } from 'pg-boss';
import { startRegisteredJobs } from '@/jobs/job-router.js';

import '@/jobs/fetch-keepa-history-for-asin.js';
import '@/jobs/process-keepa-history-refresh-queue.js';
import '@/jobs/process-product-ingest-queue.js';
import '@/jobs/reprocess-stale-products.js';

export const startJobs = async (boss: PgBoss) => {
    return startRegisteredJobs(boss);
};
