import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { spApiSyncQueue } from '@/db/schema.js';

export async function deleteSpApiSyncQueueItems(itemIds: string[]) {
    if (itemIds.length === 0) {
        return;
    }
    await db.delete(spApiSyncQueue).where(inArray(spApiSyncQueue.id, itemIds));
}

export async function deleteSpApiSyncQueueItemsForIdentities(
    identities: Array<{ marketplaceId: string; asin: string }>
) {
    if (identities.length === 0) {
        return;
    }

    const identityCondition = or(
        ...identities.map(identity =>
            and(
                eq(spApiSyncQueue.marketplaceId, identity.marketplaceId),
                eq(spApiSyncQueue.asin, identity.asin)
            )
        )
    );
    if (!identityCondition) {
        return;
    }

    await db.delete(spApiSyncQueue).where(identityCondition);
}
