import { eventLogCreated } from '@/api/app/event-log-created';
import { syncControlChanged } from '@/api/app/sync-control-changed';
import { keywordDirectoryChanged } from '@/api/app/keyword-directory-changed';
import { keywordDirectoryCounts } from './keyword-directory-counts';
import { keywordDirectoryRows } from './keyword-directory-rows';
import { syncControlGet } from './sync-control-get';
import { syncControlSet } from './sync-control-set';
import { keywordTrack } from './keyword-track';
import { keywordDirectory } from './keyword-directory';
import { router } from '@/api/trpc.js';
import { accessUsage } from './access-usage';
import { adminStatus } from './admin-status.js';
import { amazonRouter } from './amazon-router.js';
import { catalogRouter } from './catalog-router';
import { classifyProductFacets } from './classify-product-facets.js';
import { collectionStatus } from './collection-status';
import { eventLogsList } from './event-logs.js';
import { getAdminStats } from './get-admin-stats.js';
import { getKeepaStatus } from './get-keepa-status.js';
import { getProductCutoutThumbnailMetricsSummary } from './get-product-cutout-thumbnail-metrics';
import { getProductFacetMetricsSummary } from './get-product-facet-metrics.js';
import { getProductFacets } from './get-product-facets.js';
import { getProductHistory } from './get-product-history.js';
import { getProductShortNameMetricsSummary } from './get-product-short-name-metrics';
import { jobExecutions } from './job-executions.js';
import { keepaLog } from './keepa-log.js';
import { loadProductHistory } from './load-product-history.js';
import { operationGet } from './operation-get.js';
import { productGet } from './product-get';
import { productHistoryRefreshCompleted } from './product-history-refresh-completed';
import { productSearch } from './product-search';
import { productSearchMetadata } from './product-search-metadata';
import { productSyncCompleted } from './product-sync-completed';
import { providerTelemetryGet } from './provider-telemetry-get';
import { jobActivity } from './job-activity';
import { keywordJobsStatus } from './keyword-jobs-status';

export const appApiRouter = router({
    syncControl: router({ get: syncControlGet, set: syncControlSet, changed: syncControlChanged }),
    keyword: router({ directory: router({ changed: keywordDirectoryChanged }) }),
    activity: router({ created: eventLogCreated }),
    keywordDirectory,
    keywordDirectoryCounts,
    keywordDirectoryRows,
    keywordTrack,
    access: router({
        usage: accessUsage,
    }),
    adminStatus,
    collectionStatus,
    amazon: amazonRouter,
    classifyProductFacets,
    catalog: catalogRouter,
    eventLogs: eventLogsList,
    getAdminStats,
    keepaLog,
    getKeepaStatus,
    getProductFacetMetricsSummary,
    getProductFacets,
    jobExecutions,
    jobs: router({ keywordStatus: keywordJobsStatus, activity: jobActivity }),
    getProductHistory,
    getProductShortNameMetricsSummary,
    getProductCutoutThumbnailMetricsSummary,
    loadProductHistory,
    operation: router({
        get: operationGet,
    }),
    providerTelemetry: router({
        get: providerTelemetryGet,
    }),
    product: router({
        get: productGet,
        search: productSearch,
        searchMetadata: productSearchMetadata,
        sync: router({
            completed: productSyncCompleted,
        }),
        history: router({
            refresh: router({
                completed: productHistoryRefreshCompleted,
            }),
        }),
    }),
});
