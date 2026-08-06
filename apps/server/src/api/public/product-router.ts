import { router } from '@/api/trpc.js';
import { productGet } from './product-get.js';
import { productHistory } from './product-history.js';
import { productSearch } from './product-search.js';

export const productRouter = router({
    get: productGet,
    history: productHistory,
    search: productSearch,
});
