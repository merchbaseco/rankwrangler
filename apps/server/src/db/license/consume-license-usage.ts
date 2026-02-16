import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { licenses } from '@/db/schema.js';

type ConsumedLicense = {
    id: string;
    email: string;
    usageToday: number;
    usageLimit: number;
};

export const consumeLicenseUsage = async (
    licenseId: string,
    amount: number,
    usageLimit: number
): Promise<ConsumedLicense | null> => {
    if (amount <= 0) {
        const [license] = await db
            .select({
                id: licenses.id,
                email: licenses.email,
                usageToday: licenses.usageToday,
                usageLimit: licenses.usageLimit,
            })
            .from(licenses)
            .where(eq(licenses.id, licenseId))
            .limit(1);

        return license ?? null;
    }

    const updateWhereClause =
        usageLimit === -1
            ? eq(licenses.id, licenseId)
            : and(
                  eq(licenses.id, licenseId),
                  sql`${licenses.usageToday} + ${amount} <= ${licenses.usageLimit}`
              );

    const [updatedLicense] = await db
        .update(licenses)
        .set({
            usageCount: sql`${licenses.usageCount} + ${amount}`,
            usageToday: sql`${licenses.usageToday} + ${amount}`,
            lastUsedAt: new Date(),
        })
        .where(updateWhereClause)
        .returning({
            id: licenses.id,
            email: licenses.email,
            usageToday: licenses.usageToday,
            usageLimit: licenses.usageLimit,
        });

    return updatedLicense ?? null;
};
