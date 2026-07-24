import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { licenses } from '@/db/schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CatalogSearchLicenseDebit =
    | { kind: 'consumed' }
    | {
          kind: 'rejected';
          reason: 'licenseNotFound' | 'usageLimitExceeded';
          usageLimit: number | null;
      };

export const consumeCatalogSearchLicenseUsage = async (
    transaction: Transaction,
    licenseId: string,
    now: Date
): Promise<CatalogSearchLicenseDebit> => {
    const utcDayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const utcDayStartSql = sql`cast(${formatSqlTimestamp(utcDayStart)} as timestamp)`;
    const nowSql = sql`cast(${formatSqlTimestamp(now)} as timestamp)`;
    const currentDailyUsage = sql<number>`case
        when ${licenses.lastResetAt} < ${utcDayStartSql} then 0
        else ${licenses.usageToday}
    end`;

    const [consumed] = await transaction
        .update(licenses)
        .set({
            usageCount: sql`${licenses.usageCount} + 1`,
            usageToday: sql`${currentDailyUsage} + 1`,
            lastResetAt: sql`case
                when ${licenses.lastResetAt} < ${utcDayStartSql} then ${nowSql}
                else ${licenses.lastResetAt}
            end`,
            lastUsedAt: now,
        })
        .where(
            and(
                eq(licenses.id, licenseId),
                isNull(licenses.revokedAt),
                or(
                    eq(licenses.usageLimit, -1),
                    sql`${currentDailyUsage} + 1 <= ${licenses.usageLimit}`
                )
            )
        )
        .returning({ id: licenses.id });

    if (consumed) {
        return { kind: 'consumed' };
    }

    const [license] = await transaction
        .select({
            revokedAt: licenses.revokedAt,
            usageLimit: licenses.usageLimit,
        })
        .from(licenses)
        .where(eq(licenses.id, licenseId))
        .limit(1);

    if (!license || license.revokedAt) {
        return {
            kind: 'rejected',
            reason: 'licenseNotFound',
            usageLimit: null,
        };
    }

    return {
        kind: 'rejected',
        reason: 'usageLimitExceeded',
        usageLimit: license.usageLimit,
    };
};

const formatSqlTimestamp = (value: Date) => {
    return value.toISOString().replace('T', ' ').replace('Z', '');
};
