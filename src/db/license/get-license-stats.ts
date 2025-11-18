import { eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses, products, systemStats } from '@/db/schema.js';

export async function getLicenseStats() {
    const [totalCount] = await db.select({ count: sql<number>`count(*)` }).from(licenses);

    const total = totalCount.count;

    // Get products in store count (live count)
    const [productCount] = await db.select({ 
        count: sql<number>`count(*)` 
    })
    .from(products)
    .where(gte(products.expiresAt, new Date()));

    // Get system stats (counters)
    const [stats] = await db.select()
        .from(systemStats)
        .where(eq(systemStats.id, 'current'))
        .limit(1);

    return {
        total,
        productsInStore: productCount.count,
        recentApiCalls: stats?.totalSpApiCalls || 0,
        totalCacheHits: stats?.totalCacheHits || 0
    };
}

