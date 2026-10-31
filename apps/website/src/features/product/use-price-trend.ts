import { useMemo } from 'react';
import { api } from '@/lib/trpc';
import { historyPoints } from './history-points';
import { priceTrendLabel } from './product-format';
import type { ProductIdentity } from './product-identity';

const WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * How the new price moved over the last 90 days of stored Keepa history, as
 * the listing's `· flat 90d` note (null with fewer than two priced samples),
 * and whether it is still loading so the row can wait for it.
 */
export const usePriceTrend = (identity: ProductIdentity, currencyCode: string | null) => {
    const query = api.api.app.getProductHistory.useQuery(priceTrendInput(identity), {
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    const label = useMemo(() => {
        const samples = historyPoints(query.data).flatMap(point =>
            point.value === null || point.isMissing || point.value <= 0 ? [] : [point.value]
        );
        return priceTrendLabel(samples, currencyCode, `${WINDOW_DAYS}d`);
    }, [currencyCode, query.data]);
    return { isLoading: query.isLoading, label };
};

/**
 * The trend's history input. The window opens at a UTC day boundary, so the
 * key holds steady through the day and prefetching can build the same one.
 */
export const priceTrendInput = ({ asin, marketplaceId }: ProductIdentity) => ({
    asin,
    limit: 5000,
    marketplaceId,
    metric: 'priceNew' as const,
    refresh: 'none' as const,
    startAt: new Date((Math.floor(Date.now() / DAY_MS) - WINDOW_DAYS) * DAY_MS).toISOString(),
});
