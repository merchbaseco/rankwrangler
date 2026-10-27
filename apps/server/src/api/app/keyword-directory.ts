import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectory } from '@/db/keyword-directory';

export const keywordDirectory = appProcedure
    .input(keywordDirectoryInput)
    .query(({ input }) => readKeywordDirectory(input));
