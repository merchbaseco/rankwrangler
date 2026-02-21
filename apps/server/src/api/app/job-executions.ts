import { z } from 'zod';
import { adminProcedure } from '@/api/trpc.js';
import { listRecentJobExecutions } from '@/services/job-executions.js';

const jobExecutionsInput = z.object({
    limit: z.number().int().min(1).max(100).default(25),
    status: z.enum(['success', 'failed']).optional(),
    jobNames: z.array(z.string().min(1)).nonempty().max(10).optional(),
});

export const jobExecutions = adminProcedure
    .input(jobExecutionsInput.optional())
    .query(async ({ input }) => {
        const limit = input?.limit ?? 25;

        return listRecentJobExecutions({
            limit,
            status: input?.status,
            jobNames: input?.jobNames,
        });
    });
