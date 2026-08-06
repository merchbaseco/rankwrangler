import { publicApiProcedure } from '@/api/trpc.js';
import { getKeywordHistory } from '@/services/keyword-intelligence.js';
import { mapRetrievalError } from '@/services/retrieval-coordinator.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { keywordHistoryInput } from './keyword-input';

export interface KeywordHistoryDeps {
    getKeywordHistory: typeof getKeywordHistory;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: KeywordHistoryDeps = {
    getKeywordHistory,
    consumeServiceAccountUsageForRequest,
};

export const createKeywordHistoryProcedure = (deps: KeywordHistoryDeps = defaultDeps) =>
    publicApiProcedure.input(keywordHistoryInput).query(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await deps.getKeywordHistory({
                ...input,
                signal,
            });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const keywordHistory = createKeywordHistoryProcedure();
