import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { loadKeepaProductHistory } from '@/services/keepa.js';

const MANUAL_KEEPA_WAIT_TIMEOUT_MS = 2 * 60 * 1000;
const MANUAL_KEEPA_RETRY_INITIAL_DELAY_MS = 1000;
const MANUAL_KEEPA_RETRY_MAX_DELAY_MS = 15000;

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
    .mutation(async ({ input }) => {
        return retryManualKeepaLoad({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            days: input.days,
        });
    });

const retryManualKeepaLoad = async ({
    marketplaceId,
    asin,
    days,
}: {
    marketplaceId: string;
    asin: string;
    days: number;
}) => {
    const deadlineMs = Date.now() + MANUAL_KEEPA_WAIT_TIMEOUT_MS;
    let attempt = 0;
    let lastRetryableErrorMessage: string | null = null;

    while (Date.now() < deadlineMs) {
        try {
            return await loadKeepaProductHistory({
                marketplaceId,
                asin,
                days,
                queuePriority: 'manual',
            });
        } catch (error) {
            if (!isRetryableKeepaError(error)) {
                throw error;
            }

            lastRetryableErrorMessage = getRetryableErrorMessage(error);
            const remainingMs = deadlineMs - Date.now();
            if (remainingMs <= 0) {
                break;
            }

            const delayMs = Math.min(getRetryDelayMs(attempt), remainingMs);
            await sleep(delayMs);
            attempt += 1;
        }
    }

    throw new TRPCError({
        code: 'TIMEOUT',
        message: lastRetryableErrorMessage
            ? `Keepa request timed out after retries: ${lastRetryableErrorMessage}`
            : 'Keepa request timed out after retries. Please retry shortly.',
    });
};

const isRetryableKeepaError = (error: unknown) => {
    return error instanceof TRPCError && error.code === 'BAD_GATEWAY';
};

const getRetryableErrorMessage = (error: TRPCError) => {
    return error.message;
};

const getRetryDelayMs = (attempt: number) => {
    return Math.min(
        MANUAL_KEEPA_RETRY_MAX_DELAY_MS,
        MANUAL_KEEPA_RETRY_INITIAL_DELAY_MS * 2 ** Math.max(0, attempt)
    );
};

const sleep = async (delayMs: number) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
};
