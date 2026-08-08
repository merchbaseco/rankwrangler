import { publicApiProcedure } from '@/api/trpc';
import {
    getPublicProductHistory,
    type PublicProductHistoryInput,
} from '@/services/public-product-history';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productHistoryInput } from './product-input';

export interface ProductHistoryDeps {
    getPublicProductHistory: typeof getPublicProductHistory;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: ProductHistoryDeps = {
    getPublicProductHistory,
    consumeServiceAccountUsageForRequest,
};

export const createProductHistoryProcedure = (deps: ProductHistoryDeps = defaultDeps) =>
    publicApiProcedure.input(productHistoryInput).mutation(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await deps.getPublicProductHistory({
                ...input,
                ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
                signal,
            } satisfies PublicProductHistoryInput);
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const productHistory = createProductHistoryProcedure();
