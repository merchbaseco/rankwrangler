import { router } from '@/api/trpc';
import { productGet } from './product-get';
import { productGetMany } from './product-get-many';
import { productHistory } from './product-history';
import { productSearch } from './product-search';

export const productRouter = router({
    get: productGet,
    getMany: productGetMany,
    history: productHistory,
    search: productSearch,
});
