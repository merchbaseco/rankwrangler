import { z } from 'zod';
import { adminProcedure } from '@/api/trpc';
import { setAutomaticSyncPaused } from '@/db/automatic-sync';

export const createSyncControlSet = (setPaused = setAutomaticSyncPaused) =>
    adminProcedure
        .input(z.object({ paused: z.boolean() }))
        .mutation(async ({ input, ctx }) => ({
            ...(await setPaused(input.paused, ctx.user?.sub ?? 'admin')),
            canManage: true,
        }));
export const syncControlSet = createSyncControlSet();
