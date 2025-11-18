import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { systemStats } from '@/db/schema.js';

// Helper function to track cache hits
export async function trackCacheHit() {
    try {
        await db
            .update(systemStats)
            .set({
                totalCacheHits: sql`${systemStats.totalCacheHits} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track cache hit:', error);
    }
}

