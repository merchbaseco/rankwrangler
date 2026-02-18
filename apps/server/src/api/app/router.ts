import { router } from '@/api/trpc.js';
import { getKeepaStatus } from './get-keepa-status.js';
import { getProductHistory } from './get-product-history.js';
import { getProductInfo } from './get-product-info.js';
import { appLicenseRouter } from './license.js';
import { loadProductHistory } from './load-product-history.js';
import { recentProducts } from './recent-products.js';

export const appApiRouter = router({
    getKeepaStatus,
    getProductHistory,
    getProductInfo,
    loadProductHistory,
    recentProducts,
    license: appLicenseRouter,
});
