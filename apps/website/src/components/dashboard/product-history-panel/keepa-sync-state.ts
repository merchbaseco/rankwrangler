export const KEEPA_STALE_REFRESH_MS = 48 * 60 * 60 * 1000;

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

    const parsedKeepaLastSyncAt = Date.parse(keepaLastSyncAt);
    if (!Number.isFinite(parsedKeepaLastSyncAt)) {
        return true;
    }

    return nowMs - parsedKeepaLastSyncAt > KEEPA_STALE_REFRESH_MS;
};

export const shouldEvaluateKeepaAutoRefresh = ({
    hasCheckedAutoRefresh,
    isRankQueryLoading,
}: {
    hasCheckedAutoRefresh: boolean;
    isRankQueryLoading: boolean;
}) => {
    return !hasCheckedAutoRefresh && !isRankQueryLoading;
};

export const shouldTriggerKeepaSync = ({
    isRankQueryError,
    isKeepaSyncStale,
}: {
    isRankQueryError: boolean;
    isKeepaSyncStale: boolean;
}) => {
    return !isRankQueryError && isKeepaSyncStale;
};
