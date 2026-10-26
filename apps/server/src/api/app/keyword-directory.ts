import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { listKeywordDirectory } from '@/db/keyword-directory';

export const keywordDirectory = appProcedure
    .input(keywordDirectoryInput)
    .query(({ input }) => listKeywordDirectory(input));
