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

export const appApiRouter = router({
    syncControl: router({ get: syncControlGet, set: syncControlSet }),
    keywordDirectory,
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
