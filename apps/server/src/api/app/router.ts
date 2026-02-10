import { router } from '@/api/trpc.js';
import { getProductInfo } from './get-product-info.js';
import { appLicenseRouter } from './license.js';

export const appApiRouter = router({
    getProductInfo,
    license: appLicenseRouter,
});
