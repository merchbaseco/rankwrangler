import { appProcedure } from '@/api/trpc';
import { productSummaryInput } from '@/api/public/product-input';
import { getStoredProductByIdentity } from '@/db/product/get-product';

export const productGet = appProcedure.input(productSummaryInput).query(async ({ input }) => {
    return await getStoredProductByIdentity(input.marketplaceId, input.asin);
});
