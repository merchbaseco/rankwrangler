import { inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { productIngestQueue } from '@/db/schema.js';

export async function deleteQueueItems(itemIds: string[]) {
    if (itemIds.length === 0) {
        return;
    }
    await db.delete(productIngestQueue).where(inArray(productIngestQueue.id, itemIds));
}

