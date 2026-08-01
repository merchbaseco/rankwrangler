import { TRPCError } from '@trpc/server';
import { appProcedure } from '@/api/trpc';
import { getServiceAccountUsage } from '@/services/access/service-account-usage';

export const accessUsage = appProcedure.query(async ({ ctx }) => {
    const usage = await getServiceAccountUsage(ctx.accessPrincipal.id);
    if (!usage) {
        throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: 'RankWrangler service account is unavailable.',
        });
    }

    return {
        usageToday: usage.usageToday,
        usageCount: usage.usageCount,
        usageLimit: usage.usageLimit,
        lastResetAt: usage.lastResetAt.toISOString(),
        lastUsedAt: usage.lastUsedAt?.toISOString() ?? null,
    };
});
