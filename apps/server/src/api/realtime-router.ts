import { catalogSearchCompleted } from '@/api/app/catalog-search-completed';
import { productHistoryRefreshCompleted } from '@/api/app/product-history-refresh-completed';
import { productSyncCompleted } from '@/api/app/product-sync-completed';
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
                sync: router({
                    completed: productSyncCompleted,
                }),
                history: router({
                    refresh: router({
                        completed: productHistoryRefreshCompleted,
                    }),
                }),
            }),
        }),
    }),
});
