import { appProcedure } from '@/api/trpc';
import { getProducts } from '@/services/product-retrieval';
import { productSummaryInput } from '@/api/public/product-input';

export const productGet = appProcedure.input(productSummaryInput).query(async ({ input }) => {
    const [result] = await getProducts({
        products: [input],
        fetchPolicy: 'background',
    });
    return result ?? null;
});
