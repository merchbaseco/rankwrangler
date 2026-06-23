import { router } from '@/api/trpc.js';
import { devCreateClerkSignInToken } from './dev-create-clerk-sign-in-token.js';
import { licenseStatus } from './license-status.js';
import { licenseValidate } from './license-validate.js';
import { productRouter } from './product-router.js';

export const publicApiRouter = router({
    product: productRouter,
    dev: router({
        createClerkSignInToken: devCreateClerkSignInToken,
    }),
    license: router({
        validate: licenseValidate,
        status: licenseStatus,
    }),
});
