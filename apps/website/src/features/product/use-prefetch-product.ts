import { useCallback } from 'react';
import { api } from '@/lib/trpc';
import type { ProductIdentity } from './product-identity';
import { priceTrendInput } from './use-price-trend';
import { productDetailInput } from './use-product-detail';
import { rankHistoryInput } from './use-rank-history';

const PREFETCH_STALE_MS = 30_000;

/**
 * Warms a Product page's first reads (detail, facets, keywords, full rank
 * history, the price trend) on intent, a row or shelf block the pointer rests on, so opening it
 * renders from cache. Reads already cached or in flight are left alone.
 */
export const usePrefetchProduct = () => {
    const utils = api.useUtils();
    return useCallback(
        (identity: ProductIdentity) => {
            const options = { staleTime: PREFETCH_STALE_MS };
            // Prefetch failures are not the user's concern; the page reads again when shown.
            Promise.allSettled([
                utils.api.app.product.get.prefetch(productDetailInput(identity), options),
                utils.api.app.getProductFacets.prefetch(identity, options),
                utils.api.app.product.keywords.prefetch(identity, options),
                utils.api.app.getProductHistory.prefetch(rankHistoryInput(identity), options),
                utils.api.app.getProductHistory.prefetch(priceTrendInput(identity), options),
            ]).catch(() => undefined);
        },
        [utils]
    );
};
