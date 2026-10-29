/** Rank history older than this asks Keepa for a refresh when the page opens. */
export const KEEPA_STALE_REFRESH_MS = 48 * 60 * 60 * 1000;

/** True when the last Keepa import is missing, unparseable, or older than 48 hours. */
export const isKeepaSyncStale = ({
    keepaLastSyncAt,
    nowMs = Date.now(),
}: {
    keepaLastSyncAt: string | null;
    nowMs?: number;
}) => {
    if (!keepaLastSyncAt) {
        return true;
    }
    const lastSync = Date.parse(keepaLastSyncAt);
    if (!Number.isFinite(lastSync)) {
        return true;
    }
    return nowMs - lastSync > KEEPA_STALE_REFRESH_MS;
};

/**
 * Whether opening the page should start one Keepa sync: once per product,
 * after the rank read settles without error, only when the stored history is
 * stale.
 */
export const shouldAutoSyncKeepa = ({
    hasChecked,
    isRankQueryError,
    isRankQueryLoading,
    isStale,
}: {
    hasChecked: boolean;
    isRankQueryError: boolean;
    isRankQueryLoading: boolean;
    isStale: boolean;
}) => !(hasChecked || isRankQueryLoading || isRankQueryError) && isStale;

type PollableOperation =
    | { id: string; status: 'pending'; retryAfterSeconds: number }
    | { id: string; status: 'completed'; resource: unknown; error: unknown };

/**
 * The fallback poll for a history Operation: the server's retry hint while it
 * is pending, nothing once it completes. The realtime event usually lands first.
 */
export const operationPollingInterval = (operation: PollableOperation | undefined) =>
    operation?.status === 'pending' ? operation.retryAfterSeconds * 1000 : false;

interface HistoryRefreshIdentity {
    readonly operationId: string;
    readonly marketplaceId: string;
    readonly asin: string;
}

/**
 * Handlers for the `product.history.refresh.completed` subscription: a
 * completion for this product's active Operation, or a realtime reconnect,
 * invalidates that Operation and the page's history reads. Completions for any
 * other Operation are ignored.
 */
export const createHistoryRefreshHandlers = ({
    invalidateHistory,
    invalidateOperation,
    ...identity
}: HistoryRefreshIdentity & {
    invalidateHistory: () => Promise<unknown>;
    invalidateOperation: (operationId: string) => Promise<unknown>;
}) => {
    const invalidateActiveReads = async () => {
        await Promise.all([invalidateOperation(identity.operationId), invalidateHistory()]);
    };
    return {
        onCompleted: async (event: HistoryRefreshIdentity) => {
            if (
                event.operationId !== identity.operationId ||
                event.marketplaceId !== identity.marketplaceId ||
                event.asin !== identity.asin
            ) {
                return;
            }
            await invalidateActiveReads();
        },
        onReconnect: invalidateActiveReads,
    };
};
