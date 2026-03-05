import { useEffect, useRef } from 'react';
import {
    shouldEvaluateKeepaAutoRefresh,
    shouldTriggerKeepaSync,
} from '@/components/dashboard/product-history-panel/keepa-sync-state';

export const useKeepaAutoSync = ({
    enabled,
    isKeepaSyncStale,
    isRankQueryError,
    isRankQueryLoading,
    triggerKeepaSync,
}: {
    enabled: boolean;
    isKeepaSyncStale: boolean;
    isRankQueryError: boolean;
    isRankQueryLoading: boolean;
    triggerKeepaSync: () => void;
}) => {
    const hasCheckedAutoRefreshRef = useRef(false);

    useEffect(() => {
        if (!enabled) {
            hasCheckedAutoRefreshRef.current = false;
            return;
        }

        if (
            !shouldEvaluateKeepaAutoRefresh({
                hasCheckedAutoRefresh: hasCheckedAutoRefreshRef.current,
                isRankQueryLoading,
            })
        ) {
            return;
        }

        hasCheckedAutoRefreshRef.current = true;
        if (
            !shouldTriggerKeepaSync({
                isRankQueryError,
                isKeepaSyncStale,
            })
        ) {
            return;
        }

        triggerKeepaSync();
    }, [enabled, isKeepaSyncStale, isRankQueryError, isRankQueryLoading, triggerKeepaSync]);
};
