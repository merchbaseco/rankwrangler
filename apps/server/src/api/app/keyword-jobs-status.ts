import { adminProcedure } from '@/api/trpc';
import { readKeywordJobsStatus } from '@/services/keyword-jobs-status';

export const keywordJobsStatus = adminProcedure.query(() => readKeywordJobsStatus());
