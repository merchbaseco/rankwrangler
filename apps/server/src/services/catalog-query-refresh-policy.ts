export const CATALOG_QUERY_ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const CATALOG_QUERY_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS = 60 * 60 * 1000;
export const CATALOG_SEARCH_INTERACTIVE_RETRY_INTERVAL_MS = 5 * 60 * 1000;
export const CATALOG_QUERY_EXPIRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const catalogQueryStatuses = [
    'inactive',
    'pending',
    'failed',
    'due',
    'deferred',
    'expiringSoon',
    'waiting',
] as const;

export type CatalogQueryStatus = (typeof catalogQueryStatuses)[number];

export const isCatalogQueryActive = ({
    activeUntil,
    now,
}: {
    activeUntil: Date | null;
    now: Date;
}) => Boolean(activeUntil && activeUntil > now);

export const isCatalogQueryDue = ({
    activeUntil,
    latestSuccessfulRunAt,
    now,
}: {
    activeUntil: Date | null;
    latestSuccessfulRunAt: Date | null;
    now: Date;
}) => {
    if (!isCatalogQueryActive({ activeUntil, now })) {
        return false;
    }
    if (!latestSuccessfulRunAt) {
        return true;
    }
    return now.getTime() - latestSuccessfulRunAt.getTime() >= CATALOG_QUERY_REFRESH_INTERVAL_MS;
};

export const deriveCatalogQueryStatus = ({
    activeUntil,
    latestSuccessfulRunAt,
    nextRefreshAttemptAt,
    hasPendingOperation,
    hasFailedOperation,
    now,
}: {
    activeUntil: Date | null;
    latestSuccessfulRunAt: Date | null;
    nextRefreshAttemptAt: Date | null;
    hasPendingOperation: boolean;
    hasFailedOperation: boolean;
    now: Date;
}): CatalogQueryStatus => {
    if (!isCatalogQueryActive({ activeUntil, now })) {
        return 'inactive';
    }
    if (hasPendingOperation) {
        return 'pending';
    }
    if (hasFailedOperation) {
        return 'failed';
    }
    if (nextRefreshAttemptAt && nextRefreshAttemptAt > now) {
        return 'deferred';
    }
    if (isCatalogQueryDue({ activeUntil, latestSuccessfulRunAt, now })) {
        return 'due';
    }
    if (
        activeUntil &&
        activeUntil.getTime() - now.getTime() <= CATALOG_QUERY_EXPIRING_SOON_WINDOW_MS
    ) {
        return 'expiringSoon';
    }
    return 'waiting';
};
