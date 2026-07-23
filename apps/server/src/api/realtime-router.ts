import { productHistoryRefreshCompleted } from '@/api/app/product-history-refresh-completed';
import { router } from '@/api/trpc';

export const realtimeRouter = router({
    api: router({
        app: router({
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
