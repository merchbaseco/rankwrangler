import { publicApiProcedure } from '@/api/trpc';
import { listKeywordDirectory } from '@/db/keyword-directory';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { keywordListInput } from './keyword-input';

export const keywordList = publicApiProcedure
    .input(keywordListInput)
    .query(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);
        const { term, ...filters } = input;
        return listKeywordDirectory({ ...filters, search: term });
    });
