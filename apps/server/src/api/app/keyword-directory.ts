import { appKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectory } from '@/db/keyword-directory';
import { readKeywordDirectoryDetail } from '@/db/keyword-directory-detail';

export const keywordDirectory = appProcedure
    .input(appKeywordDirectoryInput)
    .query(async ({ input }) => {
        const result = await readKeywordDirectory(input);
        return {
            ...result,
            items: await readKeywordDirectoryDetail(result.items, result.view.asOf),
        };
    });
