import { productSearchInput } from '@/api/product-search-input';
import { appProcedure } from '@/api/trpc';
import { searchProducts } from '@/services/product-search';

export const productSearch = appProcedure
    .input(productSearchInput)
    .query(({ input }) => searchProducts(input));
