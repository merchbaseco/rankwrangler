import { api } from '@/lib/trpc';
import type { ProductIdentity } from './product-identity';

/** The niche facets classified for this product, category then value order. */
export const useProductFacets = (identity: ProductIdentity) => {
    const query = api.api.app.getProductFacets.useQuery(identity, {
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    return { facets: query.data ?? [], isLoading: query.isLoading };
};
