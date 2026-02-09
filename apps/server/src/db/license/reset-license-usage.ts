import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

export async function resetLicenseUsage(
    licenseId: string,
): Promise<boolean> {
    const result = await db.update(licenses)
        .set({
            usageToday: 0,
            lastResetAt: new Date(),
        })
        .where(eq(licenses.id, licenseId))
        .returning({ id: licenses.id });

    return result.length > 0;
}

