import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

export async function deleteLicense(licenseId: string): Promise<boolean> {
    const result = await db.delete(licenses)
        .where(eq(licenses.id, licenseId))
        .returning({ id: licenses.id });

    return result.length > 0;
}

