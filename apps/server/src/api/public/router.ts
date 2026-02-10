import { router } from '@/api/trpc.js';
import { getProductInfo } from './get-product-info.js';
import { licenseStatus } from './license-status.js';
import { licenseValidate } from './license-validate.js';

export const publicApiRouter = router({
    getProductInfo,
    license: router({
        validate: licenseValidate,
        status: licenseStatus,
    }),
});
