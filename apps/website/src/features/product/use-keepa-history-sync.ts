import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type RouterOutputs } from '@/lib/trpc';
import { useRealtimeReconnect } from '@/lib/trpc-provider';
import {
    createHistoryRefreshHandlers,
    isKeepaSyncStale,
    operationPollingInterval,
    shouldAutoSyncKeepa,
} from './keepa-sync-state';
import type { ProductIdentity } from './product-identity';

type HistoryOperation = RouterOutputs['api']['app']['operation']['get'];
type CompletedOperation = Extract<HistoryOperation, { status: 'completed' }>;

const SYNC_DAYS = 365;
const EMPTY_OPERATION_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Keeps the page's Keepa history current. Opening a live listing whose last
 * import is over 48 hours old starts one `loadProductHistory` sync; a pending
 * Operation (started here or already running server-side) is followed by the
 * `product.history.refresh.completed` event with an `operation.get` poll as
 * fallback. On completion every history read for this product, and the
 * product record (its Keepa averages), is invalidated.
 */
export const useKeepaHistorySync = ({
    enabled,
    identity,
    rank,
}: {
    /** Only live listings sync; a deleted listing has no history to gain. */
    enabled: boolean;
    identity: ProductIdentity;
    rank: {
        isError: boolean;
        isLoading: boolean;
        latestImportAt: string | null;
        operation: HistoryOperation | null;
    };
}) => {
    const { asin, marketplaceId } = identity;
    const utils = api.useUtils();
    const [active, setActive] = useState<HistoryOperation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const completedRef = useRef<string | null>(null);
    const checkedRef = useRef(false);

    const invalidateHistory = useCallback(
        async () =>
            await Promise.all([
                utils.api.app.getProductHistory.invalidate({ asin, marketplaceId }),
                utils.api.app.product.get.invalidate({ asin, marketplaceId }),
            ]),
        [asin, marketplaceId, utils]
    );

    // Adopt an Operation the server already has pending for this product.
    const observed = rank.operation;
    useEffect(() => {
        if (observed?.status === 'pending') {
            setActive(current => (current?.id === observed.id ? current : observed));
        }
    }, [observed]);

    const mutation = api.api.app.loadProductHistory.useMutation({
        onError: failure => setError(failure.message),
        onSuccess: data => {
            completedRef.current = null;
            setError(null);
            setActive(data.operation);
        },
    });

    const operationQuery = api.api.app.operation.get.useQuery(
        { id: active?.id ?? EMPTY_OPERATION_ID },
        {
            enabled: Boolean(active),
            initialData: active ?? undefined,
            refetchInterval: query => operationPollingInterval(query.state.data),
        }
    );
    const terminal = terminalOperation(operationQuery.data, active);

    useHistoryRefreshEvents({ identity, invalidateHistory, operationId: active?.id ?? null });

    useEffect(() => {
        if (!terminal || completedRef.current === terminal.id) {
            return;
        }
        completedRef.current = terminal.id;
        invalidateHistory()
            .catch((failure: unknown) => {
                console.error('Invalidating product history failed', failure);
            })
            .finally(() => {
                setError(terminal.error ? terminal.error.message : null);
                setActive(current => (current?.id === terminal.id ? null : current));
            });
    }, [invalidateHistory, terminal]);

    const isSyncing = mutation.isPending || active?.status === 'pending';
    const { mutate } = mutation;
    const sync = useCallback(() => {
        if (!isSyncing) {
            mutate({ asin, days: SYNC_DAYS, marketplaceId });
        }
    }, [asin, isSyncing, marketplaceId, mutate]);

    // One automatic sync per product when its stored history is stale.
    useEffect(() => {
        if (!enabled) {
            checkedRef.current = false;
            return;
        }
        const isStale = isKeepaSyncStale({ keepaLastSyncAt: rank.latestImportAt });
        const shouldSync = shouldAutoSyncKeepa({
            hasChecked: checkedRef.current,
            isRankQueryError: rank.isError,
            isRankQueryLoading: rank.isLoading,
            isStale,
        });
        if (!rank.isLoading) {
            checkedRef.current = true;
        }
        if (shouldSync) {
            sync();
        }
    }, [enabled, rank.isError, rank.isLoading, rank.latestImportAt, sync]);

    return { error, isSyncing, sync };
};

/** The realtime half: completion events and reconnects for the active Operation. */
const useHistoryRefreshEvents = ({
    identity,
    invalidateHistory,
    operationId,
}: {
    identity: ProductIdentity;
    invalidateHistory: () => Promise<unknown>;
    operationId: string | null;
}) => {
    const utils = api.useUtils();
    const handlers = useMemo(
        () =>
            createHistoryRefreshHandlers({
                asin: identity.asin,
                invalidateHistory,
                invalidateOperation: async id =>
                    await utils.api.app.operation.get.invalidate({ id }),
                marketplaceId: identity.marketplaceId,
                operationId: operationId ?? '',
            }),
        [identity.asin, identity.marketplaceId, invalidateHistory, operationId, utils]
    );
    api.api.app.product.history.refresh.completed.useSubscription(
        { asin: identity.asin, marketplaceId: identity.marketplaceId },
        { enabled: Boolean(operationId), onData: handlers.onCompleted }
    );
    useRealtimeReconnect({ enabled: Boolean(operationId), onReconnect: handlers.onReconnect });
};

/** The completed Operation, from the latest poll or the mutation's own answer. */
const terminalOperation = (
    polled: HistoryOperation | undefined,
    active: HistoryOperation | null
): CompletedOperation | null => {
    if (polled?.status === 'completed') {
        return polled;
    }
    return active?.status === 'completed' ? active : null;
};
