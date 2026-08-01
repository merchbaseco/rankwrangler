import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc';
import {
    type CatalogSearchCompletedEvent,
    subscribeToCatalogSearchCompleted,
} from '@/services/catalog-search-events';

export const catalogSearchCompleted = appProcedure
    .input(z.object({ queryId: z.string().uuid() }))
    .subscription(({ input }) => {
        return observable<CatalogSearchCompletedEvent>(emit => {
            return subscribeToCatalogSearchCompleted(input, event => {
                emit.next(event);
            });
        });
    });
