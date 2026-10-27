import { eventLogCreated } from '@/api/app/event-log-created';
import { syncControlChanged } from '@/api/app/sync-control-changed';
import { keywordDirectoryChanged } from '@/api/app/keyword-directory-changed';
import { catalogSearchCompleted } from '@/api/app/catalog-search-completed';
import { productHistoryRefreshCompleted } from '@/api/app/product-history-refresh-completed';
import { productSyncCompleted } from '@/api/app/product-sync-completed';
import { router } from '@/api/trpc';

export const realtimeRouter = router({
    api: router({
        app: router({
            keyword: router({ directory: router({ changed: keywordDirectoryChanged }) }),
            syncControl: router({ changed: syncControlChanged }),
            activity: router({ created: eventLogCreated }),
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
