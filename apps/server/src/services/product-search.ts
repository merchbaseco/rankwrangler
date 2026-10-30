import { TRPCError } from '@trpc/server';
import type { StoredProductSearchInput } from '@/api/product-search-input';
import { type ProductExtraColumn, searchStoredProducts } from '@/db/product-search';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { InvalidProductSearchCursorError } from '@/db/product-search-sort';

/**
 * Stored Product search. A first page (no cursor, page 1 or unset) with a term records the phrase
 * as keyword interest unless the caller opts out (`recordInterest: false`, the dashboard's live
 * search).
 */
export const searchProducts = async <Extra = never>(
    input: StoredProductSearchInput,
    {
        recordInterest = true,
        extra,
    }: { recordInterest?: boolean; extra?: ProductExtraColumn<Extra> } = {}
) => {
    try {
        const results = await searchStoredProducts(input, new Date(), extra);
        const coverage =
            input.cursor || (input.page ?? 1) > 1 || !recordInterest
                ? null
                : await recordProductSearchInterest(input);
        return { ...results, coverage };
    } catch (error) {
        if (error instanceof InvalidProductSearchCursorError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
    }
};
