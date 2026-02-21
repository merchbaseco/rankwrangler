import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { productIngestQueue } from '@/db/schema.js';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export async function getQueueItems(limit: number = 20) {
    // Pick the highest-priority marketplace first (US gets priority), then process
    // a single marketplace per batch so ASIN lookups always use the correct marketplace.
    const [firstMarketplace] = await db
        .select({
            marketplaceId: productIngestQueue.marketplaceId,
        })
        .from(productIngestQueue)
        .orderBy(
            sql`CASE WHEN ${productIngestQueue.marketplaceId} = ${US_MARKETPLACE_ID} THEN 0 ELSE 1 END`,
            productIngestQueue.marketplaceId,
            productIngestQueue.createdAt
        )
        .limit(1);

    if (!firstMarketplace) {
        return [];
    }

    return await db
        .select()
        .from(productIngestQueue)
        .where(eq(productIngestQueue.marketplaceId, firstMarketplace.marketplaceId))
        .orderBy(productIngestQueue.createdAt)
        .limit(limit);
}
