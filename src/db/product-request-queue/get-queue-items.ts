import { db } from '@/db/index.js';
import { productRequestQueue } from '@/db/schema.js';

export async function getQueueItems(limit: number = 20) {
    return await db
        .select()
        .from(productRequestQueue)
        .orderBy(productRequestQueue.createdAt)
        .limit(limit);
}

