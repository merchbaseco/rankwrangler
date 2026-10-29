import { router } from '@/api/trpc.js';
import { accessUsage } from './access-usage';
import { adminStatus } from './admin-status.js';
import { amazonRouter } from './amazon-router.js';
import { catalogRouter } from './catalog-router';
import { classifyProductFacets } from './classify-product-facets.js';
import { collectionStatus } from './collection-status';
import { eventLogCreated } from './event-log-created';
import { eventLogsList } from './event-logs.js';
import { getAdminStats } from './get-admin-stats.js';
import { getKeepaStatus } from './get-keepa-status.js';
import { getProductCutoutThumbnailMetricsSummary } from './get-product-cutout-thumbnail-metrics';
import { getProductFacetMetricsSummary } from './get-product-facet-metrics.js';
import { getProductFacets } from './get-product-facets.js';
import { getProductHistory } from './get-product-history.js';
import { getProductShortNameMetricsSummary } from './get-product-short-name-metrics';
import { jobActivity } from './job-activity';
import { jobExecutions } from './job-executions.js';
import { keepaLog } from './keepa-log.js';
import { keywordDirectory } from './keyword-directory';
import { keywordDirectoryChanged } from './keyword-directory-changed';
import { keywordDirectoryCounts } from './keyword-directory-counts';
import { keywordDirectoryFacets } from './keyword-directory-facets';
import { keywordDirectoryRows } from './keyword-directory-rows';
import { keywordJobsStatus } from './keyword-jobs-status';
import { keywordTrack } from './keyword-track';
import { loadProductHistory } from './load-product-history.js';
import { operationGet } from './operation-get.js';
import { productGet } from './product-get';
import { productHistoryRefreshCompleted } from './product-history-refresh-completed';
import { productKeywords } from './product-keywords';
import { productSearch } from './product-search';
import { productSearchFacets } from './product-search-facets';
import { productSearchMetadata } from './product-search-metadata';
import { productSyncCompleted } from './product-sync-completed';
import { providerTelemetryGet } from './provider-telemetry-get';
import { statsSummary } from './stats-summary';
import { syncControlChanged } from './sync-control-changed';
import { syncControlGet } from './sync-control-get';
import { syncControlSet } from './sync-control-set';

export const appApiRouter = router({
    syncControl: router({ get: syncControlGet, set: syncControlSet, changed: syncControlChanged }),
    keyword: router({
        directory: router({ changed: keywordDirectoryChanged }),
        directoryFacets: keywordDirectoryFacets,
    }),
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
    stats: router({
        summary: statsSummary,
    }),
    product: router({
        get: productGet,
        keywords: productKeywords,
        search: productSearch,
        searchFacets: productSearchFacets,
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
