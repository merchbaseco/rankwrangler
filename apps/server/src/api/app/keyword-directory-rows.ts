import { z } from 'zod';
import { keywordDirectoryInput, keywordDirectoryCursor } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectory } from '@/db/keyword-directory';

export const keywordDirectoryRows = appProcedure
    .input(
        z.object({
            terms: z.array(z.string().min(1).max(200)).min(1).max(100),
            view: keywordDirectoryCursor.omit({ key: true }),
        })
    )
    .query(async ({ input }) => {
        const result = await readKeywordDirectory(keywordDirectoryInput.parse({}), input);
        return result.items;
    });
