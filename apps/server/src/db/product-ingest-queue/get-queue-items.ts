import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { productIngestQueue } from '@/db/schema.js';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export async function getQueueItems(limit: number = 20) {
    // Sort: US marketplace first, then group other marketplaces into chunks,
    // then by createdAt within each marketplace chunk
    return await db
        .select()
        .from(productIngestQueue)
        .orderBy(
            sql`CASE WHEN ${productIngestQueue.marketplaceId} = ${US_MARKETPLACE_ID} THEN 0 ELSE 1 END`,
            productIngestQueue.marketplaceId,
            productIngestQueue.createdAt
        )
        .limit(limit);
}

