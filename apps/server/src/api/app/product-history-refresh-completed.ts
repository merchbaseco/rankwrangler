import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc';
import {
    type ProductHistoryRefreshCompletedEvent,
    subscribeToProductHistoryRefreshCompleted,
} from '@/services/product-history-refresh-events';

const productHistoryRefreshIdentity = z.object({
    marketplaceId: z.string().min(1),
    asin: z
        .string()
        .regex(/^[A-Z0-9]{10}$/i)
        .transform(value => value.toUpperCase()),
});

export const productHistoryRefreshCompleted = appProcedure
    .input(productHistoryRefreshIdentity)
    .subscription(({ input }) => {
        return observable<ProductHistoryRefreshCompletedEvent>(emit => {
            return subscribeToProductHistoryRefreshCompleted(input, event => {
                emit.next(event);
            });
        });
    });
