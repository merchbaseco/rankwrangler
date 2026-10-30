import { resolveProductIdentity } from '@/services/resolve-product-identity';
import { productSummaryInput } from '@/api/public/product-input';
import { appProcedure } from '@/api/trpc';
import { getProductAppDetail } from '@/db/product/product-app-detail';
import { getProductAppReadModel } from '@/services/product-app-read-model';
import { mapRetrievalError } from '@/services/retrieval-coordinator';

export const productGet = appProcedure
    .input(productSummaryInput)
    .query(async ({ input: requested, signal }) => {
        try {
            const input = await resolveProductIdentity(requested);
            const result = await getProductAppReadModel({ ...input, signal });
            return { ...result, ...(await getProductAppDetail(result.product)) };
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });
