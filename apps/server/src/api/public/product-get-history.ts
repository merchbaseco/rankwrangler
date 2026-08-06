import { publicApiProcedure } from '@/api/trpc.js';
import {
    getProductHistorySurface,
    type ProductHistorySurfaceInput,
} from '@/services/product-history-surface.js';
import { mapRetrievalError } from '@/services/retrieval-coordinator.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productHistoryInput } from './product-input.js';

export interface ProductGetHistoryDeps {
    getProductHistorySurface: typeof getProductHistorySurface;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: ProductGetHistoryDeps = {
    getProductHistorySurface,
    consumeServiceAccountUsageForRequest,
};

export const createProductGetHistoryProcedure = (deps: ProductGetHistoryDeps = defaultDeps) =>
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

export const productGetHistory = createProductGetHistoryProcedure();
