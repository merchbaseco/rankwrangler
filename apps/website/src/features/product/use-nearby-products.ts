import { useMemo } from 'react';
import type { NicheFacet } from '@/features/niche/niche-facet';
import { api } from '@/lib/trpc';
import type { ProductIdentity } from './product-identity';

const NEARBY_LIMIT = 6;

/**
 * The best-ranked live Merch designs sharing this product's niche: one
 * `product.search` page by BSR, one extra row requested so dropping the
 * product itself still leaves a full row. Disabled until a niche is known.
 */
export const useNearbyProducts = (identity: ProductIdentity, niche: NicheFacet | null) => {
    const input = useMemo(
        () => ({
            facets: niche ? [{ facet: niche.facet, name: niche.name }] : [],
            limit: NEARBY_LIMIT + 1,
            marketplaceIds: [identity.marketplaceId],
            sort: 'salesRankAsc' as const,
        }),
        [identity.marketplaceId, niche]
    );
    const query = api.api.app.product.search.useQuery(input, {
        enabled: niche !== null,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    const products = useMemo(
        () =>
            (query.data?.items ?? [])
                .filter(item => item.asin !== identity.asin)
                .slice(0, NEARBY_LIMIT),
        [identity.asin, query.data]
    );
    return { isLoading: niche !== null && query.isLoading, products };
};
