import { publicApiProcedure } from '@/api/trpc';
import { listKeywordDirectory } from '@/db/keyword-directory';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { keywordSearchInput } from './keyword-input';

export const keywordSearch = publicApiProcedure
    .input(keywordSearchInput)
    .query(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);
        const { text, ...filters } = input;
        return listKeywordDirectory({ ...filters, search: text });
    });
