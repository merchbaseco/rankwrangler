import { z } from 'zod';
import { publicApiProcedure } from '@/api/trpc.js';
import {
    triggerKeepaProductHistoryManualLoad,
} from '@/services/keepa-manual-load.js';
import { getProductHistoryPoints } from '@/services/keepa.js';
import { consumeLicenseUsageOrThrow } from './consume-license-usage.js';

const getProductHistoryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(10000).default(5000),
    days: z.coerce.number().int().min(30).max(3650).default(365),
});

export const getProductHistory = publicApiProcedure
    .input(getProductHistoryInput)
    .mutation(async ({ input, ctx }) => {
        await consumeLicenseUsageOrThrow(ctx, 1);

        const result = await getProductHistoryPoints({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            metric: 'bsrMain',
            startAt: input.startAt,
            endAt: input.endAt,
            limit: input.limit,
        });

        if (result.points.length > 0) {
            return {
                ...result,
                collecting: false,
                syncTriggered: false,
            };
        }

        const syncTriggerResult = triggerKeepaProductHistoryManualLoad({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            days: input.days,
        });

        return {
            ...result,
            collecting: true,
            syncTriggered: syncTriggerResult.triggered,
        };
    });
