import { router } from '@/api/trpc';
import { catalogQueryGet } from './catalog-query-get';
import { catalogQueryList } from './catalog-query-list';
import { catalogRunGet } from './catalog-run-get';
import { catalogRunList } from './catalog-run-list';
import { catalogSearch } from './catalog-search';
import { catalogSearchCompleted } from './catalog-search-completed';

export const catalogRouter = router({
    search: router({
        request: catalogSearch,
        completed: catalogSearchCompleted,
    }),
    query: router({
        get: catalogQueryGet,
        list: catalogQueryList,
    }),
    run: router({
        get: catalogRunGet,
        list: catalogRunList,
    }),
});
