import { appProcedure } from '@/api/trpc';
import { readStatsSummary } from '@/db/stats-summary';

export const statsSummary = appProcedure.query(() => readStatsSummary());
