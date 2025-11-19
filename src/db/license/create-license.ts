import { db } from '@/db/index.js';
import { licenses, type License } from '@/db/schema.js';

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

    const [license] = await db.insert(licenses).values(licenseData).returning();

    console.log(`[License Service] License created:`, {
        id: license.id,
        hasKey: !!license.key,
        keyLength: license.key ? license.key.length : 0,
    });

    return license;
}

