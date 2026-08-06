import { productSummaryInput } from '@/api/public/product-input';
import { appProcedure } from '@/api/trpc';
import { getProductDetails } from '@/services/product-retrieval';
import { mapRetrievalError } from '@/services/retrieval-coordinator';

export const productGet = appProcedure
    .input(productSummaryInput)
    .query(async ({ input, signal }) => {
        try {
            return await getProductDetails({ ...input, signal });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });
