import { inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { spApiSyncQueue } from '@/db/schema.js';

export async function deleteSpApiSyncQueueItems(itemIds: string[]) {
    if (itemIds.length === 0) {
        return;
    }
    await db.delete(spApiSyncQueue).where(inArray(spApiSyncQueue.id, itemIds));
}
