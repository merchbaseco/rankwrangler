import { keywordDirectoryFilters } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { countKeywordDirectoryStages } from '@/db/keyword-directory-counts';

export const keywordDirectoryCounts = appProcedure
    .input(keywordDirectoryFilters)
    .query(({ input }) => countKeywordDirectoryStages(input));
