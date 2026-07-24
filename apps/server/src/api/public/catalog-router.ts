import { router } from '@/api/trpc';
import { catalogRunGet } from './catalog-run-get';
import { catalogSearch } from './catalog-search';

export const catalogRouter = router({
    search: catalogSearch,
    run: router({
        get: catalogRunGet,
    }),
});
