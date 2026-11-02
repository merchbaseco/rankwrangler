import { router } from '@/api/trpc';
import { productFamily } from './product-family';
import { productGet } from './product-get';
import { productGetMany } from './product-get-many';
import { productHistory } from './product-history';
import { productSearch } from './product-search';

export const productRouter = router({
    family: productFamily,
    get: productGet,
    getMany: productGetMany,
    history: productHistory,
    search: productSearch,
});
