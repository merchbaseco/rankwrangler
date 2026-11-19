import { TRPCError } from '@trpc/server';
import type { ProductSearchInput } from '@/api/product-search-input';
import { hasKeywordHeadRun } from '@/db/product-search-ranking';
import { CatalogSearchBillingError } from '@/services/catalog-search';
import { awaitCatalogSearchRetrieval } from '@/services/catalog-search-retrieval';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { searchProducts } from './product-search';

export interface CollectingProductSearchDeps {
    searchProducts: (input: ProductSearchInput) => ReturnType<typeof searchProducts<never>>;
    hasKeywordHeadRun: typeof hasKeywordHeadRun;
    collectKeywordHead: typeof awaitCatalogSearchRetrieval;
}

const defaultDeps: CollectingProductSearchDeps = {
    searchProducts: input => searchProducts(input),
    hasKeywordHeadRun,
    collectKeywordHead: awaitCatalogSearchRetrieval,
};

/**
 * The public Product search. When a first page with a term finds nothing and Amazon's search for
 * that exact term has never been collected, it starts (or joins) that collection, waits for it,
 * and searches again, so a niche the catalog has not seen yet answers on the first call. Pages
 * after the first, searches that found something, and terms already collected answer from the
 * stored catalog alone. Collection is US-only.
 */
export const searchProductsCollectingTerm = async (
    input: ProductSearchInput,
    caller: { serviceAccountId: string; ownerMerchbaseUserId: string; signal?: AbortSignal },
    deps: CollectingProductSearchDeps = defaultDeps
) => {
    const stored = await deps.searchProducts(input);
    if (
        !input.term ||
        input.cursor ||
        stored.items.length > 0 ||
        input.marketplaceId !== US_MARKETPLACE_ID ||
        (await deps.hasKeywordHeadRun(input.term))
    ) {
        return stored;
    }
    try {
        await deps.collectKeywordHead({ term: input.term, ...caller });
    } catch (error) {
        if (error instanceof CatalogSearchBillingError) {
            throw new TRPCError({
                code:
                    error.reason === 'usageLimitExceeded'
                        ? 'TOO_MANY_REQUESTS'
                        : 'SERVICE_UNAVAILABLE',
                message: error.message,
                cause: error,
            });
        }
        throw mapRetrievalError(error);
    }
    return await deps.searchProducts(input);
};

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
