import { productSummaryInput } from '@/api/public/product-input';
import { appProcedure } from '@/api/trpc';
import { getProductAppReadModel } from '@/services/product-app-read-model';
import { mapRetrievalError } from '@/services/retrieval-coordinator';

export const productGet = appProcedure
    .input(productSummaryInput)
    .query(async ({ input, signal }) => {
        try {
            return await getProductAppReadModel({ ...input, signal });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });
