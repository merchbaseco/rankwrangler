import { router } from '@/api/trpc.js';
import { getProductInfo } from './get-product-info.js';
import { appLicenseRouter } from './license.js';
import { recentProducts } from './recent-products.js';

export const appApiRouter = router({
    getProductInfo,
    recentProducts,
    license: appLicenseRouter,
});
