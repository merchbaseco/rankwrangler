import { db } from '@/db/index.js';
import { productIngestQueue } from '@/db/schema.js';

export async function getQueueItems(limit: number = 20) {
    return await db
        .select()
        .from(productIngestQueue)
        .orderBy(productIngestQueue.createdAt)
        .limit(limit);
}

