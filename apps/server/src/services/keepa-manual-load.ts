import { TRPCError } from '@trpc/server';
import { completeProductHistoryOperationSuccess } from '@/db/operations.js';
import { loadKeepaProductHistory, type KeepaImportSummary } from '@/services/keepa.js';

const MANUAL_KEEPA_WAIT_TIMEOUT_MS = 2 * 60 * 1000;
const MANUAL_KEEPA_RETRY_INITIAL_DELAY_MS = 1000;
const MANUAL_KEEPA_RETRY_MAX_DELAY_MS = 15000;

type ManualLoadInFlight = {
    days: number;
    promise: Promise<KeepaImportSummary>;
};

const manualLoadInFlight = new Map<string, ManualLoadInFlight>();

export const loadKeepaProductHistoryManually = async ({
    marketplaceId,
    asin,
    days,
    operationId,
}: {
    marketplaceId: string;
    asin: string;
    days: number;
    operationId?: string;
}) => {
    const key = `${marketplaceId}:${asin}`;
    const inFlightLoad = manualLoadInFlight.get(key);
    if (inFlightLoad && inFlightLoad.days >= days) {
        const summary = await inFlightLoad.promise;
        await completeOperationFromExistingLoad({ marketplaceId, asin, operationId });
        return summary;
    }

    if (inFlightLoad) {
        await inFlightLoad.promise.catch(() => {});
        const nextInFlightLoad = manualLoadInFlight.get(key);
        if (nextInFlightLoad && nextInFlightLoad.days >= days) {
            const summary = await nextInFlightLoad.promise;
            await completeOperationFromExistingLoad({ marketplaceId, asin, operationId });
            return summary;
        }
    }

    const loadPromise = runKeepaProductHistoryManualLoad({
        marketplaceId,
        asin,
        days,
        operationId,
    }).finally(() => {
        manualLoadInFlight.delete(key);
    });
    manualLoadInFlight.set(key, { days, promise: loadPromise });

    const summary = await loadPromise;
    await completeOperationFromExistingLoad({ marketplaceId, asin, operationId });
    return summary;
};

const runKeepaProductHistoryManualLoad = async ({
    marketplaceId,
    asin,
    days,
    operationId,
}: {
    marketplaceId: string;
    asin: string;
    days: number;
    operationId?: string;
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
                operationId,
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

export const triggerKeepaProductHistoryManualLoad = ({
    marketplaceId,
    asin,
    days,
}: {
    marketplaceId: string;
    asin: string;
    days: number;
}) => {
    const key = `${marketplaceId}:${asin}`;
    if (manualLoadInFlight.has(key)) {
        return {
            triggered: false,
            reason: 'in_flight',
        } as const;
    }

    const loadPromise = loadKeepaProductHistoryManually({
        marketplaceId,
        asin,
        days,
    });
    void loadPromise.catch(error => {
        console.error(
            `[Keepa Manual] Failed to load history for ${asin} (${marketplaceId}):`,
            error
        );
    });

    return {
        triggered: true,
        reason: 'started',
    } as const;
};

const isRetryableKeepaError = (error: unknown) => {
    return error instanceof TRPCError && error.code === 'BAD_GATEWAY';
};

const getRetryableErrorMessage = (error: unknown) => {
    if (error instanceof TRPCError) {
        return error.message;
    }

    return 'Keepa request failed.';
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

const completeOperationFromExistingLoad = async ({
    marketplaceId,
    asin,
    operationId,
}: {
    marketplaceId: string;
    asin: string;
    operationId?: string;
}) => {
    if (!operationId) {
        return;
    }

    await completeProductHistoryOperationSuccess({
        operationId,
        marketplaceId,
        asin,
    });
};
