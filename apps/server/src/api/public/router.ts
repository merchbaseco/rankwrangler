import { router } from '@/api/trpc.js';
import { catalogRouter } from './catalog-router';
import { devCreateClerkSignInToken } from './dev-create-clerk-sign-in-token.js';
import { keywordRouter } from './keyword-router';
import { operationRouter } from './operation-router.js';
import { productRouter } from './product-router.js';

export const publicApiRouter = router({
    catalog: catalogRouter,
    keyword: keywordRouter,
    product: productRouter,
    operation: operationRouter,
    dev: router({
        createClerkSignInToken: devCreateClerkSignInToken,
    }),
});
