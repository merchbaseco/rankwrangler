import { publicApiProcedure } from '@/api/trpc.js';
import { searchKeywordIntelligence } from '@/services/keyword-intelligence.js';
import { mapRetrievalError } from '@/services/retrieval-coordinator.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { keywordSearchInput } from './keyword-input';

export interface KeywordSearchDeps {
    searchKeywordIntelligence: typeof searchKeywordIntelligence;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: KeywordSearchDeps = {
    searchKeywordIntelligence,
    consumeServiceAccountUsageForRequest,
};

export const createKeywordSearchProcedure = (deps: KeywordSearchDeps = defaultDeps) =>
    publicApiProcedure.input(keywordSearchInput).query(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await deps.searchKeywordIntelligence({
                ...input,
                signal,
            });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const keywordSearch = createKeywordSearchProcedure();
