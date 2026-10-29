import { useMemo, useState } from 'react';
import { api } from '@/lib/trpc';
import { historyPoints } from './history-points';
import { priceTrendLabel } from './product-format';
import type { ProductIdentity } from './product-identity';

const WINDOW_DAYS = 90;

/**
 * How the new price moved over the last 90 days of stored Keepa history, as
 * the listing's `· flat 90d` note. Null until there are two priced samples.
 */
export const usePriceTrend = (identity: ProductIdentity, currencyCode: string | null) => {
    // Fixed per mount so the query key stays stable.
    const [startAt] = useState(() => new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString());
    const query = api.api.app.getProductHistory.useQuery(
        { ...identity, limit: 5000, metric: 'priceNew', refresh: 'none', startAt },
        { refetchOnWindowFocus: false, staleTime: 60_000 }
    );
    return useMemo(() => {
        const samples = historyPoints(query.data).flatMap(point =>
            point.value === null || point.isMissing || point.value <= 0 ? [] : [point.value]
        );
        return priceTrendLabel(samples, currencyCode, `${WINDOW_DAYS}d`);
    }, [currencyCode, query.data]);
};
