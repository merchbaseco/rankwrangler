import { router } from '@/api/trpc.js';
import { productGet } from './product-get.js';
import { productGetHistory } from './product-get-history.js';
import { productGetSummary } from './product-get-summary.js';

export const productRouter = router({
    get: productGet,
    getSummary: productGetSummary,
    getHistory: productGetHistory,
});
