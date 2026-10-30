import { appKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectory } from '@/db/keyword-directory';
import { readKeywordDirectoryDetail } from '@/db/keyword-directory-detail';
import { measure } from '@/utils/request-timing';

export const keywordDirectory = appProcedure
    .input(appKeywordDirectoryInput)
    .query(async ({ input }) => {
        const result = await measure('page', () => readKeywordDirectory(input));
        return {
            ...result,
            items: await measure('detail', () =>
                readKeywordDirectoryDetail(result.items, result.view.asOf)
            ),
        };
    });
