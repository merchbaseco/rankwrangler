import type { InferSelectModel } from 'drizzle-orm';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

type License = InferSelectModel<typeof licenses>;

export async function updateUsageStats(license: License): Promise<void> {
    // Increment usage counters and update last used timestamp
    await db.update(licenses)
        .set({
            usageCount: sql`${licenses.usageCount} + 1`,
            usageToday: sql`${licenses.usageToday} + 1`,
            lastUsedAt: new Date()
        })
        .where(eq(licenses.id, license.id));
}

