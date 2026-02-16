import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context.js';
import { consumeLicenseUsage } from '@/services/license.js';

export const consumeLicenseUsageOrThrow = async (ctx: Context, amount: number) => {
    const usageAmount = Number.isInteger(amount) ? amount : 0;
    if (usageAmount < 1) {
        return;
    }

    const licenseId = ctx.license?.data?.id;
    if (!licenseId) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Valid license key required',
        });
    }

    const consumeResult = await consumeLicenseUsage(licenseId, usageAmount);
    if (consumeResult.success) {
        return;
    }

    const message = consumeResult.error ?? 'Valid license key required';
    const code = message.toLowerCase().includes('limit') ? 'TOO_MANY_REQUESTS' : 'UNAUTHORIZED';

    throw new TRPCError({
        code,
        message,
    });
};
