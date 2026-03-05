import { router } from '@/api/trpc.js';
import { adminStatus } from './admin-status.js';
import { amazonRouter } from './amazon-router.js';
import { classifyProductFacets } from './classify-product-facets.js';
import { eventLogsList } from './event-logs.js';
import { getAdminStats } from './get-admin-stats.js';
import { keepaLog } from './keepa-log.js';
import { getKeepaStatus } from './get-keepa-status.js';
import { getProductFacetMetricsSummary } from './get-product-facet-metrics.js';
import { getProductFacets } from './get-product-facets.js';
import { jobExecutions } from './job-executions.js';
import { getProductHistory } from './get-product-history.js';
import { appLicenseRouter } from './license.js';
import { loadProductHistory } from './load-product-history.js';
import { recentProducts } from './recent-products.js';
import { searchtermsRouter } from './searchterms-router.js';
import { topSearchTermsStatus } from './top-search-terms-status.js';

export const appApiRouter = router({
    adminStatus,
    amazon: amazonRouter,
    classifyProductFacets,
    searchterms: searchtermsRouter,
    eventLogs: eventLogsList,
    getAdminStats,
    keepaLog,
    getKeepaStatus,
    getProductFacetMetricsSummary,
    getProductFacets,
    jobExecutions,
    topSearchTermsStatus,
    getProductHistory,
    loadProductHistory,
    recentProducts,
    license: appLicenseRouter,
});
