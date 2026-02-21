import { z } from 'zod';
import { adminProcedure } from '@/api/trpc.js';
import { getKeepaLogSnapshot } from '@/services/keepa-log.js';

const keepaLogInput = z.object({
    queueLimit: z.number().int().min(1).max(500).default(250),
    processedLimit: z.number().int().min(1).max(100).default(20),
});

export const keepaLog = adminProcedure
    .input(keepaLogInput.optional())
    .query(async ({ input }) => {
        return getKeepaLogSnapshot({
            queueLimit: input?.queueLimit ?? 250,
            processedLimit: input?.processedLimit ?? 20,
        });
    });
