import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { displayGroups } from '@/db/schema.js';

// Helper function to find or create display group
export async function findOrCreateDisplayGroup(category: string, link?: string): Promise<string> {
    const existing = await db
        .select()
        .from(displayGroups)
        .where(
            and(
                eq(displayGroups.category, category),
                link ? eq(displayGroups.link, link) : isNull(displayGroups.link)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        return existing[0].id;
    }

    const [newGroup] = await db
        .insert(displayGroups)
        .values({ category, link: link || null })
        .returning({ id: displayGroups.id });

    return newGroup.id;
}

