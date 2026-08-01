import { catalogSearchCompleted } from '@/api/app/catalog-search-completed';
import { productHistoryRefreshCompleted } from '@/api/app/product-history-refresh-completed';
import { router } from '@/api/trpc';

export const realtimeRouter = router({
    api: router({
        app: router({
            catalog: router({
                search: router({
                    completed: catalogSearchCompleted,
                }),
            }),
            product: router({
                history: router({
                    refresh: router({
                        completed: productHistoryRefreshCompleted,
                    }),
                }),
            }),
        }),
    }),
});
