import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { systemStats } from '@/db/schema.js';

// Helper function to track API calls
export async function trackApiCall() {
    try {
        await db
            .update(systemStats)
            .set({
                totalSpApiCalls: sql`${systemStats.totalSpApiCalls} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track API call:', error);
    }
}

