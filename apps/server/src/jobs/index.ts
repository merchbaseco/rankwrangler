import { autocompleteKeywordJob } from './autocomplete-keyword';
import { importBrandAnalyticsJob } from './import-brand-analytics';
import { scanKeywordJob } from './scan-keyword';
import { registerBrandAnalyticsKeywordsJob } from './register-brand-analytics-keywords';
import { scheduleBrandAnalyticsJob } from './schedule-brand-analytics';
import { scheduleKeywordWorkJob } from './schedule-keyword-work';
import type { PgBoss } from 'pg-boss';
import { reconcileHistoryAdmissionJob } from '@/jobs/reconcile-history-admission';
import { backfillProductVariationsJob } from '@/jobs/backfill-product-variations';
import { catalogSearchJob } from '@/jobs/catalog-search';
import { collectDueCatalogQueriesJob } from '@/jobs/collect-due-catalog-queries';
import { enqueueScheduledKeepaHistoryRefreshJob } from '@/jobs/enqueue-scheduled-keepa-history-refresh.js';
import { fetchKeepaHistoryBatchJob } from '@/jobs/fetch-keepa-history-batch';
import { foldEventLogCountsJob } from '@/jobs/fold-event-log-counts';
import { ensureJobRetention, JOB_RETENTION_SECONDS } from '@/jobs/ensure-job-queue';
import { startRegisteredJobs } from '@/jobs/job-router.js';
import { processKeepaHistoryRefreshQueueJob } from '@/jobs/process-keepa-history-refresh-queue.js';
import { processProductFacetClassificationJob } from '@/jobs/process-product-facet-classification.js';
import { processSpApiSyncQueueJob } from '@/jobs/process-spapi-sync-queue.js';
import { reclassifyMerchListingsJob } from '@/jobs/reclassify-merch-listings';
import { pruneEventLogsJob } from '@/jobs/prune-event-logs';
import { pruneJobExecutionsJob } from '@/jobs/prune-job-executions';
import { pruneProviderAttemptsJob } from '@/jobs/prune-provider-attempts';
import {
    refreshProductStatsJob,
    sendMissingProductStatsRefresh,
} from '@/jobs/refresh-product-stats';
import {
    refreshProductSearchFacetsJob,
    sendMissingProductSearchFacetsRefresh,
} from '@/jobs/refresh-product-search-facets';
import { recoverStaleCatalogSearchOperationsJob } from '@/jobs/recover-stale-catalog-search-operations';
import { recoverStaleProductHistoryOperationsJob } from '@/jobs/recover-stale-product-history-operations.js';
import { refreshProductHistoryOperationJob } from '@/jobs/refresh-product-history-operation.js';
import { repairAccessProjectionsJob } from '@/jobs/repair-access-projections';
import { reprocessStaleProductsJob } from '@/jobs/reprocess-stale-products.js';

const registeredJobs = [
    scheduleKeywordWorkJob,
    scanKeywordJob,
    autocompleteKeywordJob,
    importBrandAnalyticsJob,
    registerBrandAnalyticsKeywordsJob,
    scheduleBrandAnalyticsJob,
    catalogSearchJob,
    reconcileHistoryAdmissionJob,
    refreshProductStatsJob,
    refreshProductSearchFacetsJob,
    foldEventLogCountsJob,
    collectDueCatalogQueriesJob,
    enqueueScheduledKeepaHistoryRefreshJob,
    fetchKeepaHistoryBatchJob,
    processKeepaHistoryRefreshQueueJob,
    processProductFacetClassificationJob,
    processSpApiSyncQueueJob,
    backfillProductVariationsJob,
    reclassifyMerchListingsJob,
    pruneProviderAttemptsJob,
    pruneJobExecutionsJob,
    pruneEventLogsJob,
    reprocessStaleProductsJob,
    recoverStaleProductHistoryOperationsJob,
    recoverStaleCatalogSearchOperationsJob,
    refreshProductHistoryOperationJob,
    repairAccessProjectionsJob,
];

export const prepareJobQueues = async (boss: PgBoss) => {
    for (const job of registeredJobs)
        await boss.createQueue(job.jobName, {
            deleteAfterSeconds: JOB_RETENTION_SECONDS,
            ...job.queueOptions,
        });
};

export const startJobs = async (boss: PgBoss) => {
    await boss.unschedule('explore-keywords');
    await boss.unschedule('discover-catalog');
    await boss.unschedule('mine-product-keywords');
    await boss.unschedule('expand-keyword-autocomplete');
    await boss.unschedule('process-keyword-sync');
    await boss.unschedule('sync-top-search-terms-datasets');
    await boss.unschedule('fetch-top-search-terms-dataset');
    await prepareJobQueues(boss);
    const runtime = await startRegisteredJobs(boss);
    // pg-boss's own cron dispatch queue keeps one row per tick sent; same retention as ours.
    await ensureJobRetention(boss, '__pgboss__send-it');
    // Count once now when nothing has been counted, rather than waiting for the first tick.
    const productStatsStatus = [
        await sendMissingProductStatsRefresh(boss),
        await sendMissingProductSearchFacetsRefresh(boss),
    ].join('; ');
    return { ...runtime, productStatsStatus };
};
