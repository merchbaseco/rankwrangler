import type { PgBoss } from 'pg-boss';
import { enqueueScheduledKeepaHistoryRefreshJob } from '@/jobs/enqueue-scheduled-keepa-history-refresh.js';
import { catalogSearchJob } from '@/jobs/catalog-search';
import { collectDueCatalogQueriesJob } from '@/jobs/collect-due-catalog-queries';
import { fetchKeepaHistoryForAsinJob } from '@/jobs/fetch-keepa-history-for-asin.js';
import { fetchTopSearchTermsDatasetJob } from '@/jobs/fetch-top-search-terms-dataset.js';
import { startRegisteredJobs } from '@/jobs/job-router.js';
import { processKeepaHistoryRefreshQueueJob } from '@/jobs/process-keepa-history-refresh-queue.js';
import { processProductFacetClassificationJob } from '@/jobs/process-product-facet-classification.js';
import { processSpApiSyncQueueJob } from '@/jobs/process-spapi-sync-queue.js';
import { reprocessStaleProductsJob } from '@/jobs/reprocess-stale-products.js';
import { recoverStaleProductHistoryOperationsJob } from '@/jobs/recover-stale-product-history-operations.js';
import { recoverStaleCatalogSearchOperationsJob } from '@/jobs/recover-stale-catalog-search-operations';
import { refreshProductHistoryOperationJob } from '@/jobs/refresh-product-history-operation.js';
import { syncTopSearchTermsDatasetsJob } from '@/jobs/sync-top-search-terms-datasets.js';

const registeredJobs = [
    catalogSearchJob,
    collectDueCatalogQueriesJob,
    enqueueScheduledKeepaHistoryRefreshJob,
    fetchKeepaHistoryForAsinJob,
    fetchTopSearchTermsDatasetJob,
    processKeepaHistoryRefreshQueueJob,
    processProductFacetClassificationJob,
    processSpApiSyncQueueJob,
    reprocessStaleProductsJob,
    recoverStaleProductHistoryOperationsJob,
    recoverStaleCatalogSearchOperationsJob,
    refreshProductHistoryOperationJob,
    syncTopSearchTermsDatasetsJob,
];

export const prepareJobQueues = async (boss: PgBoss) => {
    for (const job of registeredJobs) {
        await boss.createQueue(job.jobName);
    }
};

export const startJobs = async (boss: PgBoss) => {
    return startRegisteredJobs(boss);
};
