import type { InferSelectModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

type License = InferSelectModel<typeof licenses>;

export async function createLicense(
    key: string,
    email: string,
    usageLimit: number
): Promise<License> {
    const licenseData = {
        key,
        email,
        usageLimit,
        usageCount: 0,
        usageToday: 0,
        lastResetAt: new Date(),
    };

    const [license] = await db.transaction(async tx => {
        await tx.delete(licenses).where(eq(licenses.email, email));

        return await tx.insert(licenses).values(licenseData).returning();
    });

    console.log(`[License Service] License created:`, {
        id: license.id,
        hasKey: !!license.key,
        keyLength: license.key ? license.key.length : 0,
    });

    return license;
}
