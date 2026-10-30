import { keywordDirectoryFacetsInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readCachedKeywordDirectoryFacets } from '@/services/dashboard-aggregates';

export const keywordDirectoryFacets = appProcedure
    .input(keywordDirectoryFacetsInput)
    .query(({ input }) => readCachedKeywordDirectoryFacets(input));
