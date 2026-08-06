import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { db } from '@/db/index';
import {
    consumeRankWranglerServiceAccountUsage,
    getRankWranglerServiceAccountUsage,
} from '@/db/service-account-usage';
import { getDailyAllowanceRetryAfterSeconds } from './rate-limit';

export const consumeServiceAccountUsageOrThrow = async (ctx: Context, amount: number) => {
    const serviceAccountId = ctx.accessPrincipal?.id;
    if (!serviceAccountId) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'RankWrangler access is required.',
        });
    }

    const result = await db.transaction(transaction =>
        consumeRankWranglerServiceAccountUsage(transaction, serviceAccountId, amount, new Date())
    );
    if (result.kind === 'consumed') {
        return;
    }

    if (result.reason === 'usageLimitExceeded') {
        const retryAfterSeconds = getDailyAllowanceRetryAfterSeconds();
        throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Daily limit of ${result.usageLimit ?? 0} requests exceeded. Retry after ${retryAfterSeconds} seconds. Resets at midnight UTC.`,
        });
    }

    throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'RankWrangler access is unavailable.',
    });
};

export const getServiceAccountUsage = (serviceAccountId: string) =>
    getRankWranglerServiceAccountUsage(serviceAccountId);
