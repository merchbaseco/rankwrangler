import type { Context } from '@/api/context';
import { consumeServiceAccountUsageOrThrow } from '@/services/access/service-account-usage';

export const consumeServiceAccountUsageForRequest = (ctx: Context, amount: number) =>
    consumeServiceAccountUsageOrThrow(ctx, amount);
