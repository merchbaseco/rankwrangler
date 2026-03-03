import { router } from '@/api/trpc.js';
import { adminStatus } from './admin-status.js';
import { searchTermsList } from './search-terms-list.js';
import { searchTermsRefresh } from './search-terms-refresh.js';
import { searchTermsStatus } from './search-terms-status.js';
import { eventLogsList } from './event-logs.js';
import { getAdminStats } from './get-admin-stats.js';
import { keepaLog } from './keepa-log.js';
import { getKeepaStatus } from './get-keepa-status.js';
import { jobExecutions } from './job-executions.js';
import { getProductHistory } from './get-product-history.js';
import { getProductInfo } from './get-product-info.js';
import { appLicenseRouter } from './license.js';
import { loadProductHistory } from './load-product-history.js';
import { recentProducts } from './recent-products.js';
import { topSearchTermsStatus } from './top-search-terms-status.js';

export const appApiRouter = router({
    adminStatus,
    searchTermsList,
    searchTermsRefresh,
    searchTermsStatus,
    eventLogs: eventLogsList,
    getAdminStats,
    keepaLog,
    getKeepaStatus,
    jobExecutions,
    topSearchTermsStatus,
    getProductHistory,
    getProductInfo,
    loadProductHistory,
    recentProducts,
    license: appLicenseRouter,
});
