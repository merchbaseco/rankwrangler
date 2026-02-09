import type { InferSelectModel } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

type License = InferSelectModel<typeof licenses>;

export async function listLicenses(): Promise<License[]> {
    return await db.select()
        .from(licenses)
        .orderBy(sql`${licenses.createdAt} DESC`);
}

