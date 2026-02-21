import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { spApiSyncQueue } from '@/db/schema.js';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export async function getSpApiSyncQueueItems(limit: number = 20) {
    // Pick the highest-priority marketplace first (US gets priority), then process
    // a single marketplace per batch so ASIN lookups always use the correct marketplace.
    const [firstMarketplace] = await db
        .select({
            marketplaceId: spApiSyncQueue.marketplaceId,
        })
        .from(spApiSyncQueue)
        .orderBy(
            sql`CASE WHEN ${spApiSyncQueue.marketplaceId} = ${US_MARKETPLACE_ID} THEN 0 ELSE 1 END`,
            spApiSyncQueue.marketplaceId,
            spApiSyncQueue.createdAt
        )
        .limit(1);

    if (!firstMarketplace) {
        return [];
    }

    return await db
        .select()
        .from(spApiSyncQueue)
        .where(eq(spApiSyncQueue.marketplaceId, firstMarketplace.marketplaceId))
        .orderBy(spApiSyncQueue.createdAt)
        .limit(limit);
}
