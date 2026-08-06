import { publicApiProcedure } from '@/api/trpc';
import {
    getProductHistorySurface,
    type ProductHistorySurfaceInput,
} from '@/services/product-history-surface';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productHistoryInput } from './product-input';

export interface ProductHistoryDeps {
    getProductHistorySurface: typeof getProductHistorySurface;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: ProductHistoryDeps = {
    getProductHistorySurface,
    consumeServiceAccountUsageForRequest,
};

export const createProductHistoryProcedure = (deps: ProductHistoryDeps = defaultDeps) =>
    publicApiProcedure.input(productHistoryInput).mutation(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await deps.getProductHistorySurface({
                ...input,
                format: input.format,
                refresh: input.refresh,
                ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
                signal,
            } satisfies ProductHistorySurfaceInput);
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const productHistory = createProductHistoryProcedure();
