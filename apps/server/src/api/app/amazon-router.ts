import { router } from '@/api/trpc.js';
import { amazonProductSearch } from './amazon-product-search.js';
import { amazonSearch } from './amazon-search.js';

export const amazonRouter = router({
    search: amazonSearch,
    product: router({
        search: amazonProductSearch,
    }),
});
