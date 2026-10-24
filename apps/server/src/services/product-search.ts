import { TRPCError } from '@trpc/server';
import type { ProductSearchInput } from '@/api/product-search-input';
import { searchStoredProducts } from '@/db/product-search';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { InvalidProductSearchCursorError } from '@/db/product-search-sort';

export const searchProducts = async (input: ProductSearchInput) => {
    try {
        const results = await searchStoredProducts(input);
        const coverage = input.cursor ? null : await recordProductSearchInterest(input);
        return { ...results, coverage };
    } catch (error) {
        if (error instanceof InvalidProductSearchCursorError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
    }
};
