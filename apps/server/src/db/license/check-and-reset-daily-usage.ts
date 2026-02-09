import type { InferSelectModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

type License = InferSelectModel<typeof licenses>;

export async function checkAndResetDailyUsage(license: License): Promise<void> {
    const now = new Date();
    const lastReset = new Date(license.lastResetAt);

    // Check if it's a new day (UTC)
    const isNewDay =
        now.getUTCDate() !== lastReset.getUTCDate() ||
        now.getUTCMonth() !== lastReset.getUTCMonth() ||
        now.getUTCFullYear() !== lastReset.getUTCFullYear();

    if (isNewDay) {
        await db.update(licenses)
            .set({
                usageToday: 0,
                lastResetAt: now,
            })
            .where(eq(licenses.id, license.id));
    }
}

