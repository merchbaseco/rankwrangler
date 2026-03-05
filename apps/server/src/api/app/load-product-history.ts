import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { createEventLogSafe } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import { loadKeepaProductHistoryManually } from '@/services/keepa-manual-load.js';
import { fetchProductInfo } from '@/utils/product-info.js';

const loadProductHistoryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
    days: z.coerce.number().int().min(30).max(3650).default(365),
});

type LoadProductHistoryInput = z.infer<typeof loadProductHistoryInput>;

type LoadProductHistoryDeps = {
    createEventLogSafe: typeof createEventLogSafe;
    fetchProductInfo: typeof fetchProductInfo;
    loadKeepaProductHistoryManually: typeof loadKeepaProductHistoryManually;
};

const loadProductHistoryDeps: LoadProductHistoryDeps = {
    createEventLogSafe,
    fetchProductInfo,
    loadKeepaProductHistoryManually,
};

export const runManualProductHistorySync = async ({
    input,
    actor,
    deps = loadProductHistoryDeps,
}: {
    input: LoadProductHistoryInput;
    actor: string;
    deps?: LoadProductHistoryDeps;
}) => {
    try {
        // Ensure product cache exists before requesting Keepa history.
        await deps.fetchProductInfo({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            uid: actor,
            endpoint: 'api.app.loadProductHistory',
        });

        const summary = await deps.loadKeepaProductHistoryManually({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            days: input.days,
        });

        await deps.createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'history',
            action: 'history.sync.manual',
            primitiveType: 'history',
            message: `Synced history for ${input.asin}.`,
            detailsJson: {
                actor,
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
        await deps.createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'history',
            action: 'history.sync.manual',
            primitiveType: 'history',
            message: `History sync failed for ${input.asin}.`,
            detailsJson: {
                actor,
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
};

export const loadProductHistory = appProcedure
    .input(loadProductHistoryInput)
    .mutation(async ({ input, ctx }) => {
        const actor = ctx.user?.email ?? ctx.user?.sub ?? 'unknown';
        return await runManualProductHistorySync({
            input,
            actor,
        });
    });
