import type { PgBoss } from 'pg-boss';
import { startRegisteredJobs } from '@/jobs/job-router.js';

import '@/jobs/enqueue-scheduled-keepa-history-refresh.js';
import '@/jobs/fetch-keepa-history-for-asin.js';
import '@/jobs/process-keepa-history-refresh-queue.js';
import '@/jobs/process-spapi-sync-queue.js';
import '@/jobs/reprocess-stale-products.js';

export const startJobs = async (boss: PgBoss) => {
    return startRegisteredJobs(boss);
};
