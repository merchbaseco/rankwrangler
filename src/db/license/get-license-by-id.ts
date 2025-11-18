import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses, type License } from '@/db/schema.js';

export async function getLicenseById(
    searchBy: 'id' | 'email' | 'key',
    value: string,
): Promise<License | null> {
    let whereClause;

    switch (searchBy) {
        case 'id':
            whereClause = eq(licenses.id, value); // UUID, not parseInt
            break;
        case 'email':
            whereClause = eq(licenses.email, value);
            break;
        case 'key':
            whereClause = eq(licenses.key, value);
            break;
        default:
            throw new Error('Invalid search type');
    }

    const results = await db.select()
        .from(licenses)
        .where(whereClause)
        .orderBy(sql`${licenses.createdAt} DESC`)
        .limit(1);

    return results[0] || null;
}

