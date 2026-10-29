import { appProductSearchInput } from '@/api/product-search-input';
import { appProcedure } from '@/api/trpc';
import { searchAppProducts } from '@/services/product-app-search';

export const productSearch = appProcedure
    .input(appProductSearchInput)
    .query(({ input }) => searchAppProducts(input));
