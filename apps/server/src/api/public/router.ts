import { router } from '@/api/trpc.js';
import { getProductInfoBatch } from './get-product-info-batch.js';
import { getProductInfo } from './get-product-info.js';
import { licenseStatus } from './license-status.js';
import { licenseValidate } from './license-validate.js';

export const publicApiRouter = router({
    getProductInfoBatch,
    getProductInfo,
    license: router({
        validate: licenseValidate,
        status: licenseStatus,
    }),
});
