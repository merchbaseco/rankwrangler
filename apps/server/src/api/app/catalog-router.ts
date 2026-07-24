import { router } from '@/api/trpc';
import { catalogQueryGet } from './catalog-query-get';
import { catalogQueryTrack } from './catalog-query-track';
import { catalogQueryUntrack } from './catalog-query-untrack';
import { catalogRunGet } from './catalog-run-get';
import { catalogRunList } from './catalog-run-list';
import { catalogSearch } from './catalog-search';

export const catalogRouter = router({
    search: catalogSearch,
    query: router({
        get: catalogQueryGet,
        track: catalogQueryTrack,
        untrack: catalogQueryUntrack,
    }),
    run: router({
        get: catalogRunGet,
        list: catalogRunList,
    }),
});
