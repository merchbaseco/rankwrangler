import { router } from '@/api/trpc.js';
import { keywordRouter } from './keyword-router';
import { productRouter } from './product-router.js';

export const publicApiRouter = router({
    keyword: keywordRouter,
    product: productRouter,
});
