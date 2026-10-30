import { appKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectoryWithDetail } from '@/db/keyword-directory';
import { measure } from '@/utils/request-timing';

export const keywordDirectory = appProcedure
    .input(appKeywordDirectoryInput)
    .query(({ input }) => measure('page', () => readKeywordDirectoryWithDetail(input)));
