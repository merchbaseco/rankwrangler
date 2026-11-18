import { productSummaryInput } from '@/api/public/product-input';
import { appProcedure } from '@/api/trpc';
import { getProductAppDetail } from '@/db/product/product-app-detail';
import { getProductDetails } from '@/services/product-retrieval';
import { mapRetrievalError } from '@/services/retrieval-coordinator';

/** Retrieval resolves the variant family itself, so the procedure does not resolve it first. */
export const productGet = appProcedure
    .input(productSummaryInput)
    .query(async ({ input, signal }) => {
        try {
            const result = await getProductDetails({ ...input, signal });
            return { ...result, ...(await getProductAppDetail(result.product)) };
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });
