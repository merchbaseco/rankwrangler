import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses, type License } from '@/db/schema.js';

export async function listLicenses(): Promise<License[]> {
    return await db.select()
        .from(licenses)
        .orderBy(sql`${licenses.createdAt} DESC`);
}

