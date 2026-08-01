import { and, eq, or, sql } from 'drizzle-orm';
import { type Database, db } from '@/db/index';
import { rankwranglerServiceAccounts } from '@/db/service-account-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ServiceAccountUsageDebit =
    | { kind: 'consumed' }
    | {
          kind: 'rejected';
          reason: 'serviceAccountNotFound' | 'usageLimitExceeded';
          usageLimit: number | null;
      };

export const consumeRankWranglerServiceAccountUsage = async (
    transaction: Transaction,
    serviceAccountId: string,
    amount: number,
    now: Date
): Promise<ServiceAccountUsageDebit> => {
    if (!Number.isInteger(amount) || amount < 1) {
        throw new Error('Service-account usage amount must be a positive integer.');
    }

    const utcDayStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const utcDayStartSql = sql`cast(${formatSqlTimestamp(utcDayStart)} as timestamp)`;
    const nowSql = sql`cast(${formatSqlTimestamp(now)} as timestamp)`;
    const currentDailyUsage = sql<number>`case
        when ${rankwranglerServiceAccounts.lastResetAt} < ${utcDayStartSql} then 0
        else ${rankwranglerServiceAccounts.usageToday}
    end`;

    const [consumed] = await transaction
        .update(rankwranglerServiceAccounts)
        .set({
            usageCount: sql`${rankwranglerServiceAccounts.usageCount} + ${amount}`,
            usageToday: sql`${currentDailyUsage} + ${amount}`,
            lastResetAt: sql`case
                when ${rankwranglerServiceAccounts.lastResetAt} < ${utcDayStartSql}
                    then ${nowSql}
                else ${rankwranglerServiceAccounts.lastResetAt}
            end`,
            lastUsedAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(rankwranglerServiceAccounts.id, serviceAccountId),
                eq(rankwranglerServiceAccounts.service, 'rankwrangler'),
                or(
                    eq(rankwranglerServiceAccounts.usageLimit, -1),
                    sql`${currentDailyUsage} + ${amount} <= ${rankwranglerServiceAccounts.usageLimit}`
                )
            )
        )
        .returning({ id: rankwranglerServiceAccounts.id });

    if (consumed) {
        return { kind: 'consumed' };
    }

    const [account] = await transaction
        .select({ usageLimit: rankwranglerServiceAccounts.usageLimit })
        .from(rankwranglerServiceAccounts)
        .where(
            and(
                eq(rankwranglerServiceAccounts.id, serviceAccountId),
                eq(rankwranglerServiceAccounts.service, 'rankwrangler')
            )
        )
        .limit(1);

    if (!account) {
        return {
            kind: 'rejected',
            reason: 'serviceAccountNotFound',
            usageLimit: null,
        };
    }

    return {
        kind: 'rejected',
        reason: 'usageLimitExceeded',
        usageLimit: account.usageLimit,
    };
};

export const getRankWranglerServiceAccountUsage = async (
    serviceAccountId: string,
    database: Database = db
) => {
    const utcDayStart = new Date();
    utcDayStart.setUTCHours(0, 0, 0, 0);
    const [account] = await database
        .select({
            id: rankwranglerServiceAccounts.id,
            merchbaseUserId: rankwranglerServiceAccounts.merchbaseUserId,
            usageToday: sql<number>`case
                when ${rankwranglerServiceAccounts.lastResetAt} < ${utcDayStart}
                    then 0
                else ${rankwranglerServiceAccounts.usageToday}
            end`,
            usageCount: rankwranglerServiceAccounts.usageCount,
            usageLimit: rankwranglerServiceAccounts.usageLimit,
            lastResetAt: rankwranglerServiceAccounts.lastResetAt,
            lastUsedAt: rankwranglerServiceAccounts.lastUsedAt,
        })
        .from(rankwranglerServiceAccounts)
        .where(
            and(
                eq(rankwranglerServiceAccounts.id, serviceAccountId),
                eq(rankwranglerServiceAccounts.service, 'rankwrangler')
            )
        )
        .limit(1);

    return account ?? null;
};

const formatSqlTimestamp = (value: Date) => value.toISOString().replace('T', ' ').replace('Z', '');
