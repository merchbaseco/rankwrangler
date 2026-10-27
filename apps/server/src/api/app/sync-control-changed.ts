import { observable } from '@trpc/server/observable';
import { appProcedure } from '@/api/trpc';
import {
    type SyncControlChangedEvent,
    subscribeToSyncControlChanged,
} from '@/services/sync-control-events';

export const syncControlChanged = appProcedure.subscription(() =>
    observable<SyncControlChangedEvent>(emit => subscribeToSyncControlChanged(event => emit.next(event)))
);
