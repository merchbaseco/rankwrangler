import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { publicApiProcedure } from '@/api/trpc';
import { listKeywordDirectory } from '@/db/keyword-directory';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { keywordGetInput } from './keyword-input';

export const keywordGet = publicApiProcedure
    .input(keywordGetInput)
    .query(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);
        const term = input.keyword.trim().replace(/\s+/gu, ' ').toLowerCase();
        const result = await listKeywordDirectory(keywordDirectoryInput.parse({}), {
            terms: [term],
        });
        return { keyword: term, data: result.items[0] ?? null };
    });
