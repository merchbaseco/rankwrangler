import { processKeywordSyncJob } from './process-keyword-sync';
import type { PgBoss } from 'pg-boss';
import { reconcileHistoryAdmissionJob } from '@/jobs/reconcile-history-admission';
import { catalogSearchJob } from '@/jobs/catalog-search';
import { collectDueCatalogQueriesJob } from '@/jobs/collect-due-catalog-queries';
import { enqueueScheduledKeepaHistoryRefreshJob } from '@/jobs/enqueue-scheduled-keepa-history-refresh.js';
import { fetchKeepaHistoryForAsinJob } from '@/jobs/fetch-keepa-history-for-asin.js';
import { startRegisteredJobs } from '@/jobs/job-router.js';
import { processKeepaHistoryRefreshQueueJob } from '@/jobs/process-keepa-history-refresh-queue.js';
import { processProductFacetClassificationJob } from '@/jobs/process-product-facet-classification.js';
import { processSpApiSyncQueueJob } from '@/jobs/process-spapi-sync-queue.js';
import { pruneProviderAttemptsJob } from '@/jobs/prune-provider-attempts';
import { recoverStaleCatalogSearchOperationsJob } from '@/jobs/recover-stale-catalog-search-operations';
import { recoverStaleProductHistoryOperationsJob } from '@/jobs/recover-stale-product-history-operations.js';
import { refreshProductHistoryOperationJob } from '@/jobs/refresh-product-history-operation.js';
import { repairAccessProjectionsJob } from '@/jobs/repair-access-projections';
import { reprocessStaleProductsJob } from '@/jobs/reprocess-stale-products.js';

const registeredJobs = [
    processKeywordSyncJob,
    catalogSearchJob,
    reconcileHistoryAdmissionJob,
    collectDueCatalogQueriesJob,
    enqueueScheduledKeepaHistoryRefreshJob,
    fetchKeepaHistoryForAsinJob,
    processKeepaHistoryRefreshQueueJob,
    processProductFacetClassificationJob,
    processSpApiSyncQueueJob,
    pruneProviderAttemptsJob,
    reprocessStaleProductsJob,
    recoverStaleProductHistoryOperationsJob,
    recoverStaleCatalogSearchOperationsJob,
    refreshProductHistoryOperationJob,
    repairAccessProjectionsJob,
];

export const prepareJobQueues = async (boss: PgBoss) => {
    for (const job of registeredJobs)
        await boss.createQueue(
            job.jobName,
            job.jobName === processKeywordSyncJob.jobName ? { policy: 'short' } : {}
        );
};

export const startJobs = async (boss: PgBoss) => {
    await boss.unschedule('explore-keywords');
    await boss.unschedule('discover-catalog');
    await boss.unschedule('mine-product-keywords');
    await boss.unschedule('expand-keyword-autocomplete');
    await boss.unschedule('sync-top-search-terms-datasets');
    await boss.unschedule('fetch-top-search-terms-dataset');
    await prepareJobQueues(boss);
    return startRegisteredJobs(boss);
};
