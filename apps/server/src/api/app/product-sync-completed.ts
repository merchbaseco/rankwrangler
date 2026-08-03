import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc';
import {
    type ProductSyncCompletedEvent,
    subscribeToProductSyncCompleted,
} from '@/services/product-sync-events';

export const productSyncCompleted = appProcedure
    .input(z.object({ marketplaceId: z.string().min(1) }))
    .subscription(({ input }) => {
        return observable<ProductSyncCompletedEvent>(emit => {
            return subscribeToProductSyncCompleted(input, event => {
                emit.next(event);
            });
        });
    });
