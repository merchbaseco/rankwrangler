import { api, type RouterOutputs } from '@/lib/trpc';
import type { ProductIdentity } from './product-identity';

export type ProductKeyword = RouterOutputs['api']['app']['product']['keywords']['keywords'][number];

/** Mined search pages this product appeared on (`product.keywords`), with totals. */
export const useProductKeywords = (identity: ProductIdentity) => {
    const query = api.api.app.product.keywords.useQuery(identity, {
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    return {
        error: query.error,
        isLoading: query.isLoading,
        keywords: query.data?.keywords ?? [],
        totals: query.data?.totals ?? null,
    };
};
