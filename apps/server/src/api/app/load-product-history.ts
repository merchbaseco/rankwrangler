import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { createEventLogSafe } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import { loadKeepaProductHistoryManually } from '@/services/keepa-manual-load.js';

const loadProductHistoryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
    days: z.coerce.number().int().min(30).max(3650).default(365),
});

export const loadProductHistory = appProcedure
    .input(loadProductHistoryInput)
    .mutation(async ({ input, ctx }) => {
        try {
            const summary = await loadKeepaProductHistoryManually({
                marketplaceId: input.marketplaceId,
                asin: input.asin,
                days: input.days,
            });

            await createEventLogSafe({
                level: 'info',
                status: 'success',
                category: 'history',
                action: 'history.sync.manual',
                primitiveType: 'history',
                message: `Synced history for ${input.asin}.`,
                detailsJson: {
                    actor: ctx.user?.email ?? ctx.user?.sub ?? 'unknown',
                    days: input.days,
                    importedAt: summary.importedAt,
                    marketplaceId: input.marketplaceId,
                    source: 'manual_request',
                },
                primitiveId: input.asin,
                marketplaceId: input.marketplaceId,
                asin: input.asin,
            });

            return summary;
        } catch (error) {
            await createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'history',
                action: 'history.sync.manual',
                primitiveType: 'history',
                message: `History sync failed for ${input.asin}.`,
                detailsJson: {
                    actor: ctx.user?.email ?? ctx.user?.sub ?? 'unknown',
                    days: input.days,
                    error: getErrorMessage(error),
                    marketplaceId: input.marketplaceId,
                    source: 'manual_request',
                },
                primitiveId: input.asin,
                marketplaceId: input.marketplaceId,
                asin: input.asin,
            });

            throw error;
        }
    });
