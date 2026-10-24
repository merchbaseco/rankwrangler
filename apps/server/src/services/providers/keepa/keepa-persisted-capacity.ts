import type { KeepaCapacity } from './keepa-capacity-types';

export const lazyPersistedCapacity: KeepaCapacity = {
    enqueue: async request =>
        (await import('@/db/keepa-capacity')).persistedKeepaCapacity.enqueue(request),
    cancel: async id => (await import('@/db/keepa-capacity')).persistedKeepaCapacity.cancel(id),
    reserve: async id => (await import('@/db/keepa-capacity')).persistedKeepaCapacity.reserve(id),
    settle: async (id, usage) =>
        (await import('@/db/keepa-capacity')).persistedKeepaCapacity.settle(id, usage),
};
