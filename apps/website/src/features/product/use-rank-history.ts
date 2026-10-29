import { useMemo } from 'react';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import { api } from '@/lib/trpc';
import { historyPoints } from './history-points';
import type { ProductIdentity } from './product-identity';
import { type HistoryRange, historyRangeDays } from './rank-history-axis';

/**
 * Main-category BSR for the chart's window, read from stored history only
 * (`refresh: 'none'`): refreshing is `useKeepaHistorySync`'s job, so changing
 * the range never spends a Keepa request. Also surfaces what the sync needs:
 * the last import time and any pending history Operation.
 */
export const useRankHistory = (identity: ProductIdentity, range: HistoryRange) => {
    // The window start is fixed per range so the query key stays stable.
    const startAt = useMemo(() => {
        const days = historyRangeDays[range];
        return days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString();
    }, [range]);
    const query = api.api.app.getProductHistory.useQuery(
        { ...identity, limit: 5000, metric: 'bsrMain', refresh: 'none', startAt },
        { placeholderData: previous => previous, refetchOnWindowFocus: false, staleTime: 30_000 }
    );

    const series = useMemo<RankPoint[]>(
        () =>
            historyPoints(query.data).flatMap(point =>
                point.value === null || point.isMissing || point.value <= 0
                    ? []
                    : [{ at: point.observedAt, salesRank: point.value }]
            ),
        [query.data]
    );

    const data = query.data && 'points' in query.data ? query.data : null;
    return {
        isError: query.isError,
        isFetching: query.isFetching,
        isLoading: query.isLoading,
        latestImportAt: data?.latestImportAt ?? null,
        operation: data?.operation ?? null,
        series,
    };
};
