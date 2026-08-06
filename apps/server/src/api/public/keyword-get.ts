import { publicApiProcedure } from '@/api/trpc.js';
import { getKeywordIntelligence } from '@/services/keyword-intelligence.js';
import { mapRetrievalError } from '@/services/retrieval-coordinator.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { keywordGetInput } from './keyword-input';

export interface KeywordGetDeps {
    getKeywordIntelligence: typeof getKeywordIntelligence;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: KeywordGetDeps = {
    getKeywordIntelligence,
    consumeServiceAccountUsageForRequest,
};

export const createKeywordGetProcedure = (deps: KeywordGetDeps = defaultDeps) =>
    publicApiProcedure.input(keywordGetInput).query(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await deps.getKeywordIntelligence({
                ...input,
                signal,
            });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const keywordGet = createKeywordGetProcedure();
