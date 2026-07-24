import { router } from '@/api/trpc';
import { catalogQueryGet } from './catalog-query-get';
import { catalogRunGet } from './catalog-run-get';
import { catalogRunList } from './catalog-run-list';
import { catalogSearch } from './catalog-search';

export const catalogRouter = router({
    search: catalogSearch,
    query: router({
        get: catalogQueryGet,
    }),
    run: router({
        get: catalogRunGet,
        list: catalogRunList,
    }),
});
